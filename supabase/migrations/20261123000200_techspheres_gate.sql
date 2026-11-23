-- Report gate: the PDF is only released to confirmed TechSpheres (Mailchimp) subscribers.
alter table public.whitepapers add column if not exists pdf_path text;   -- object path in the private 'reports' bucket
update public.whitepapers set pdf_path = 'industrial-tech-ma-2026.pdf' where slug = 'industrial-tech-ma-2026';

alter table public.subscribers
  add column if not exists salutation        text,
  add column if not exists position          text,
  add column if not exists language          text,
  add column if not exists mailchimp_status  text,          -- last status seen in Mailchimp: pending | subscribed | unsubscribed | cleaned
  add column if not exists mailchimp_checked_at timestamptz,
  add column if not exists report_released_at  timestamptz;

-- Private bucket: no public URL, no browser policies. The techspheres Edge Function
-- (service role) issues short-lived signed URLs to confirmed subscribers only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 52428800, array['application/pdf'])
on conflict (id) do update set public = false;
