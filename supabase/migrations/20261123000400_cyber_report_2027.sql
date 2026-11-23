-- Second whitepaper. pdf_path stays empty until the final PDF is uploaded to the 'reports' bucket;
-- until then confirmed TechSpheres subscribers see "being finalised" instead of a download.
insert into public.whitepapers (slug, title, sector, year, summary, meta, href, published_at, pdf_path) values
  ('cyber-security-report-2027', 'atares Cyber Security Report 2027', 'Cyber security', 2027,
   'Private equity now takes part in almost two thirds of DACH cyber deals. 859 providers, 103 deals and who sells next.',
   '54 pages · Data to Nov 16, 2026', 'whitepapers/cyber-security-report-2027.html', '2026-11-17', null)
on conflict (slug) do nothing;
