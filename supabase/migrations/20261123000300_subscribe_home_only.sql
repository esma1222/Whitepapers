-- Report-gate leads must go through the techspheres Edge Function (Mailchimp double opt-in),
-- so the public subscribe() RPC now only accepts the home page "notify me" form.
create or replace function public.subscribe(
  p_email text, p_source text, p_consent_text text,
  p_first_name text default null, p_last_name text default null, p_company text default null,
  p_whitepaper_slug text default null, p_user_agent text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email));
begin
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if p_source is distinct from 'home-subscribe' then
    raise exception 'invalid source' using errcode = '22023';
  end if;
  if coalesce(length(p_consent_text), 0) = 0 then
    raise exception 'consent required' using errcode = '22023';
  end if;
  insert into public.subscribers (email, source, consent_text, user_agent)
  values (v_email, 'home-subscribe', left(p_consent_text, 1000), left(p_user_agent, 500))
  on conflict (lower(email), source, coalesce(whitepaper_slug, '')) do update
    set consent_text = excluded.consent_text, consent_at = now();
end; $$;
