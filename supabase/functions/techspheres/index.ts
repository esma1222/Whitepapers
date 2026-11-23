// techspheres: report gate tied to the TechSpheres newsletter in Mailchimp.
//
//   POST { action: "subscribe", email, firstName, lastName, company, position, salutation, language, slug, consentText }
//     -> adds/updates the person in the Mailchimp audience with double opt-in (status "pending" for new people,
//        Mailchimp sends its confirmation email). Existing confirmed subscribers get the report right away.
//   POST { action: "check", token }
//     -> asks Mailchimp whether that person has confirmed. Only then returns a short-lived download URL.
//
// Secrets (Supabase dashboard > Edge Functions > Secrets):
//   MAILCHIMP_API_KEY   required, e.g. "abc123...-us21"
//   MAILCHIMP_LIST_ID   optional if the account has exactly one audience
//   TECHSPHERES_INTEREST optional, name of the Mailchimp group for the newsletter (default "atares TechSpheres")
import { createClient } from "npm:@supabase/supabase-js@2";
import { crypto } from "jsr:@std/crypto@1";
import { encodeHex } from "jsr:@std/encoding@1/hex";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

// ---------- Mailchimp ----------
const MC_KEY = Deno.env.get("MAILCHIMP_API_KEY") ?? "";
const MC_DC = MC_KEY.split("-")[1] ?? "";
const INTEREST_NAME = (Deno.env.get("TECHSPHERES_INTEREST") ?? "atares TechSpheres").toLowerCase();

async function mc(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://${MC_DC}.api.mailchimp.com/3.0${path}`, {
    ...init,
    headers: { Authorization: "Basic " + btoa("atares:" + MC_KEY), "Content-Type": "application/json" },
  });
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { status: res.status, body: body as Record<string, any> };
}

type ListMeta = { listId: string; mergeTags: Set<string>; interests: Map<string, string> };
let metaCache: ListMeta | null = null;

async function listMeta(): Promise<ListMeta> {
  if (metaCache) return metaCache;
  let listId = Deno.env.get("MAILCHIMP_LIST_ID") ?? "";
  if (!listId) {
    const r = await mc("/lists?fields=lists.id,lists.name&count=10");
    const lists = r.body.lists ?? [];
    if (lists.length !== 1) throw new Error(`Set MAILCHIMP_LIST_ID: account has ${lists.length} audiences`);
    listId = lists[0].id;
  }
  const mf = await mc(`/lists/${listId}/merge-fields?count=100&fields=merge_fields.tag`);
  const mergeTags = new Set<string>((mf.body.merge_fields ?? []).map((m: any) => m.tag));
  // Interest groups ("Marketing Preferences", "Sprachauswahl" ...), keyed by lower-case name.
  const interests = new Map<string, string>();
  const cats = await mc(`/lists/${listId}/interest-categories?count=60&fields=categories.id`);
  for (const c of cats.body.categories ?? []) {
    const it = await mc(`/lists/${listId}/interest-categories/${c.id}/interests?count=60&fields=interests.id,interests.name`);
    for (const i of it.body.interests ?? []) interests.set(String(i.name).toLowerCase(), i.id);
  }
  metaCache = { listId, mergeTags, interests };
  return metaCache;
}

async function memberHash(email: string) {
  const d = await crypto.subtle.digest("MD5", new TextEncoder().encode(email.toLowerCase()));
  return encodeHex(d);
}

/** True when Mailchimp says this person is a confirmed TechSpheres subscriber. */
function isConfirmed(member: Record<string, any>, meta: ListMeta) {
  if (member.status !== "subscribed") return false;
  const tsId = meta.interests.get(INTEREST_NAME);
  return tsId ? member.interests?.[tsId] === true : true; // no TechSpheres group in the audience -> membership is enough
}

// ---------- report download ----------
async function downloadUrl(slug: string) {
  const { data: wp } = await db.from("whitepapers").select("pdf_path,title").eq("slug", slug).eq("is_published", true).maybeSingle();
  if (!wp?.pdf_path) return null;
  const { data } = await db.storage.from("reports").createSignedUrl(wp.pdf_path, 60 * 15, {
    download: `${wp.title.replace(/[^\w &.-]+/g, "").trim()} - atares.pdf`,
  });
  return data?.signedUrl ?? null;
}

// Marks the lead confirmed and returns a download URL, or null while the report's PDF is not uploaded yet
// (report_released_at then stays empty, so the team can see who is still waiting).
async function release(row: { id: string; whitepaper_slug: string }) {
  const url = await downloadUrl(row.whitepaper_slug);
  const now = new Date().toISOString();
  await db.from("subscribers").update({ status: "confirmed", confirmed_at: now, ...(url ? { report_released_at: now } : {}) }).eq("id", row.id);
  return url;
}

// ---------- handlers ----------
async function subscribe(b: Record<string, any>) {
  if (b.website) return json({ status: "pending" }); // honeypot: bots fill hidden fields
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: "invalid_email" }, 400);
  const consentText = clip(b.consentText, 1000);
  if (!consentText) return json({ error: "consent_required" }, 400);
  const slug = clip(b.slug, 100);
  const { data: wp } = await db.from("whitepapers").select("slug").eq("slug", slug ?? "").eq("is_published", true).maybeSingle();
  if (!wp) return json({ error: "unknown_report" }, 400);

  const lead = {
    first_name: clip(b.firstName, 100), last_name: clip(b.lastName, 100), company: clip(b.company, 200),
    position: clip(b.position, 200), salutation: clip(b.salutation, 20), language: b.language === "de" ? "de" : "en",
  };

  // Mailchimp
  const meta = await listMeta();
  const hash = await memberHash(email);
  const merge: Record<string, string> = {};
  const put = (tag: string, v: string | null) => { if (v && meta.mergeTags.has(tag)) merge[tag] = v; };
  put("FNAME", lead.first_name); put("LNAME", lead.last_name); put("UNTERNEHMEN", lead.company);
  put("COMPANY", lead.company); put("POSITION", lead.position); put("SALUTATION", lead.salutation);
  const interests: Record<string, boolean> = {};
  const tsId = meta.interests.get(INTEREST_NAME);
  if (tsId) interests[tsId] = true;
  const langId = meta.interests.get(lead.language === "de" ? "deutsch" : "english");
  if (langId) interests[langId] = true;

  const base = `/lists/${meta.listId}/members/${hash}`;
  const existing = await mc(base + "?fields=status");
  let r;
  const fields = { merge_fields: merge, interests, language: lead.language };
  if (existing.status === 404 || existing.body.status === "archived") {
    r = await mc(base, { method: "PUT", body: JSON.stringify({ email_address: email, status_if_new: "pending", ...fields }) });
  } else if (existing.body.status === "cleaned") {
    return json({ error: "address_blocked" }, 400);
  } else if (existing.body.status === "unsubscribed") {
    r = await mc(base, { method: "PATCH", body: JSON.stringify({ status: "pending", ...fields }) }); // re-opt-in mail
  } else {
    r = await mc(base, { method: "PATCH", body: JSON.stringify(fields) });
  }
  if (r.status >= 400) {
    console.error("mailchimp", r.status, r.body.title, r.body.detail);
    const fake = /fake|invalid|looks fake/i.test(String(r.body.detail ?? ""));
    return json({ error: fake ? "invalid_email" : "mailchimp_error" }, fake ? 400 : 502);
  }
  await mc(base + "/tags", { method: "POST", body: JSON.stringify({ tags: [{ name: `Whitepaper: ${slug}`, status: "active" }] }) });

  // Lead record
  const { data: prev } = await db.from("subscribers").select("id,confirm_token")
    .eq("email", email).eq("source", "report-gate").eq("whitepaper_slug", slug!).maybeSingle();
  const record = { ...lead, consent_text: consentText, consent_at: new Date().toISOString(), mailchimp_status: r.body.status, mailchimp_checked_at: new Date().toISOString() };
  const { data: row, error } = prev
    ? await db.from("subscribers").update(record).eq("id", prev.id).select("id,confirm_token,whitepaper_slug").single()
    : await db.from("subscribers").insert({ ...record, email, source: "report-gate", whitepaper_slug: slug, user_agent: clip(b.userAgent, 500) }).select("id,confirm_token,whitepaper_slug").single();
  if (error) { console.error("db", error); return json({ error: "server_error" }, 500); }

  if (isConfirmed(r.body, meta)) return json({ status: "subscribed", token: row.confirm_token, url: await release(row) });
  return json({ status: "pending", token: row.confirm_token });
}

async function check(b: Record<string, any>) {
  const token = String(b.token ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: "invalid_token" }, 400);
  const { data: row } = await db.from("subscribers").select("id,email,whitepaper_slug").eq("confirm_token", token).maybeSingle();
  if (!row?.whitepaper_slug) return json({ error: "invalid_token" }, 404);
  const meta = await listMeta();
  const m = await mc(`/lists/${meta.listId}/members/${await memberHash(row.email)}?fields=status,interests`);
  const status = m.status === 404 ? "missing" : m.body.status;
  await db.from("subscribers").update({ mailchimp_status: status, mailchimp_checked_at: new Date().toISOString() }).eq("id", row.id);
  if (m.status === 200 && isConfirmed(m.body, meta)) return json({ status: "subscribed", url: await release(row) });
  return json({ status: status === "subscribed" ? "not_techspheres" : status });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!MC_KEY || !MC_DC) return json({ error: "not_configured" }, 503);
  try {
    const b = await req.json();
    if (b.action === "subscribe") return await subscribe(b);
    if (b.action === "check") return await check(b);
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
