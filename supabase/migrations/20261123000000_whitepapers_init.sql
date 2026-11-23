-- Catalog of published whitepapers (drives the library on the home page)
create table public.whitepapers (
  slug          text primary key,
  title         text not null,
  sector        text not null,
  year          int  not null,
  summary       text not null,
  meta          text,
  href          text not null,
  published_at  date not null default current_date,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.whitepapers enable row level security;
create policy "Published whitepapers are public"
  on public.whitepapers for select to anon, authenticated
  using (is_published);

-- Leads and subscribers from the home page and the report gates
create table public.subscribers (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  first_name       text,
  last_name        text,
  company          text,
  source           text not null,                 -- 'home-subscribe' | 'report-gate'
  whitepaper_slug  text references public.whitepapers(slug),
  consent_text     text not null,
  consent_at       timestamptz not null default now(),
  status           text not null default 'pending' check (status in ('pending','confirmed','unsubscribed')),
  confirm_token    uuid not null default gen_random_uuid(),
  confirmed_at     timestamptz,
  user_agent       text,
  created_at       timestamptz not null default now()
);
create unique index subscribers_email_source_paper_uq
  on public.subscribers (lower(email), source, coalesce(whitepaper_slug, ''));
-- RLS on, no policies: the table is unreadable and unwritable from the browser.
alter table public.subscribers enable row level security;

-- The only write path from the browser: validated insert, no data returned.
create or replace function public.subscribe(
  p_email text,
  p_source text,
  p_consent_text text,
  p_first_name text default null,
  p_last_name text default null,
  p_company text default null,
  p_whitepaper_slug text default null,
  p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null or length(v_email) > 254
     or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if p_source not in ('home-subscribe', 'report-gate') then
    raise exception 'invalid source' using errcode = '22023';
  end if;
  if coalesce(length(p_consent_text), 0) = 0 then
    raise exception 'consent required' using errcode = '22023';
  end if;

  insert into public.subscribers
    (email, first_name, last_name, company, source, whitepaper_slug, consent_text, user_agent)
  values
    (v_email,
     nullif(left(trim(p_first_name), 100), ''),
     nullif(left(trim(p_last_name), 100), ''),
     nullif(left(trim(p_company), 200), ''),
     p_source,
     nullif(p_whitepaper_slug, ''),
     left(p_consent_text, 1000),
     left(p_user_agent, 500))
  on conflict (lower(email), source, coalesce(whitepaper_slug, '')) do update
    set first_name   = coalesce(excluded.first_name, public.subscribers.first_name),
        last_name    = coalesce(excluded.last_name,  public.subscribers.last_name),
        company      = coalesce(excluded.company,    public.subscribers.company),
        consent_text = excluded.consent_text,
        consent_at   = now();
end;
$$;
revoke all on function public.subscribe(text,text,text,text,text,text,text,text) from public;
grant execute on function public.subscribe(text,text,text,text,text,text,text,text) to anon, authenticated;

insert into public.whitepapers (slug, title, sector, year, summary, meta, href, published_at) values
  ('industrial-tech-ma-2026', 'State of Industrial Tech M&A 2026', 'Industrial tech', 2026,
   'Deal activity, valuation dispersion and the forces reshaping industrial technology. 1,981 deals, 84 listed companies.',
   '62 pages · Deal data to Sep 16, 2026', 'whitepapers/industrial-tech-ma-2026.html', '2026-11-01');
