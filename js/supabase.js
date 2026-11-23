// Shared Supabase access for the static whitepapers site.
// The publishable key is meant for browsers: Row Level Security limits it to
// reading published whitepapers, calling public.subscribe() (home page) and the techspheres
// Edge Function (report gate). It cannot read leads or the report PDFs.
(function () {
  const SUPABASE_URL = 'https://rsqsdzglsdyoluzbouxu.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_Bl9n1qEp1jzVUYs8S1i_kw_yAsyyytT';
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };

  async function listWhitepapers() {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/whitepapers?select=slug,title,sector,year,summary,meta,href&order=published_at.desc',
      { headers }
    );
    if (!res.ok) throw new Error('whitepapers ' + res.status);
    return res.json();
  }

  /**
   * Store a lead. Fields: email, source ('home-subscribe' | 'report-gate'), consentText,
   * and optional firstName, lastName, company, whitepaperSlug.
   */
  async function subscribe(f) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/subscribe', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_email: f.email,
        p_source: f.source,
        p_consent_text: f.consentText,
        p_first_name: f.firstName || null,
        p_last_name: f.lastName || null,
        p_company: f.company || null,
        p_whitepaper_slug: f.whitepaperSlug || null,
        p_user_agent: navigator.userAgent.slice(0, 500)
      })
    });
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).message || ''; } catch (_) {}
      const err = new Error(msg || 'subscribe ' + res.status);
      err.invalidEmail = /invalid email/i.test(msg);
      throw err;
    }
  }

  /**
   * Report gate tied to the TechSpheres newsletter (Mailchimp double opt-in).
   * { action: 'subscribe', ... } or { action: 'check', token }. Resolves with the JSON body;
   * rejects with err.code set to the function's error code.
   */
  async function techspheres(payload) {
    const res = await fetch(SUPABASE_URL + '/functions/v1/techspheres', {
      method: 'POST', headers, body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(body.error || 'techspheres ' + res.status); e.code = body.error; throw e; }
    return body;
  }

  window.ataresSupabase = { listWhitepapers, subscribe, techspheres };
})();
