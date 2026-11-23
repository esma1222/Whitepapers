-- This project does not auto-grant table privileges to the API roles.
grant select on public.whitepapers to anon, authenticated;
revoke all on public.subscribers from anon, authenticated;
comment on function public.subscribe(text,text,text,text,text,text,text,text) is 'Intentionally callable by anon: the only browser write path into subscribers. Validates input, returns nothing.';
