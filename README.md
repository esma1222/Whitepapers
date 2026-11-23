# atares Insights · Whitepapers

Static site (plain HTML/JS, no build step) for the atares whitepapers, backed by Supabase project `rsqsdzglsdyoluzbouxu`.

```
index.html                                  Home: hero, featured report, library, "notify me" form
whitepapers/industrial-tech-ma-2026.html    Report landing page with the gated lead form
js/supabase.js                              Supabase URL + publishable key, listWhitepapers(), subscribe()
assets/                                     Logos, favicon, background
supabase/migrations/                        Schema (already applied to the project)
```

Run locally: `python3 -m http.server` in this folder, then open http://localhost:8000. Any static host works (Vercel, Netlify, GitHub Pages).

## Supabase

- `whitepapers`: catalog. The public can read rows with `is_published = true`. The home page shows the "All whitepapers" library once it lists two or more.
- `subscribers`: leads from both forms (`source` = `home-subscribe` or `report-gate`), with the exact consent text and timestamp. **Not readable from the browser.** View it in the Supabase dashboard (Table editor).
- `subscribe(...)`: the only browser write path. It validates the email, and a repeat signup for the same email, form and report updates that row instead of adding a new one.

### Adding a whitepaper
1. Copy `whitepapers/industrial-tech-ma-2026.html`, change its content and the `whitepaperSlug` in its form script.
2. Insert a row into `whitepapers` with the same `slug` and `href`.
3. Update the "Latest" block in `index.html` if it is the new featured report.

## Not yet done
- **No emails are sent.** Rows land with `status = 'pending'`; there is no double opt-in mail or report delivery yet. That needs an email provider (e.g. Resend) and an Edge Function, like `newsletter-signup` in the ExitReadiness app.
- The "privacy policy" link in the report form points to `#wall` and needs a real URL.
