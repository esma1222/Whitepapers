# atares Insights · Whitepapers

Static site (plain HTML/JS, no build step) for the atares whitepapers, backed by Supabase project `rsqsdzglsdyoluzbouxu`.

```
index.html                                  Home: hero, featured report, library, "notify me" form
whitepapers/industrial-tech-ma-2026.html    Report landing page with the gated lead form
js/supabase.js                              Supabase URL + publishable key, listWhitepapers(), subscribe(), techspheres()
supabase/functions/techspheres/             Edge Function: TechSpheres (Mailchimp) double opt-in and the report download
assets/                                     Logos, favicon, background
supabase/migrations/                        Schema (already applied to the project)
```

Run locally: `python3 -m http.server` in this folder, then open http://localhost:8000. Any static host works (Vercel, Netlify, GitHub Pages).

## Report gate: TechSpheres subscribers only

The full report is released only to **confirmed** subscribers of TechSpheres, the atares newsletter. That's the same Mailchimp audience the form at https://atares.team/atares-techspheres-newsletter-abo/ feeds.

1. The visitor fills in the report form (same fields as the atares.team form: salutation, names, company, position, email, language, consent).
2. The `techspheres` Edge Function adds them to the Mailchimp audience with double opt-in (`pending`), ticks the "atares TechSpheres" group and tags them `Whitepaper: <slug>`. Mailchimp sends its usual confirmation email.
3. The page waits ("confirm your subscription") and asks the function every few seconds. The function asks Mailchimp. Only when Mailchimp says **subscribed** (and the TechSpheres group is ticked) does it return a 15-minute signed link to the PDF.
4. People who are already confirmed subscribers get the download straight away. A returning visitor on the same browser is picked up automatically.

The PDFs live in the **private** storage bucket `reports` (no public access). The function signs download links with the service role.

### Setup (one-time, Supabase dashboard → Edge Functions → Secrets)
| Secret | Value |
|---|---|
| `MAILCHIMP_API_KEY` | Mailchimp → Profile → Extras → API keys (looks like `abc123…-us21`) |
| `MAILCHIMP_LIST_ID` | Audience ID of the TechSpheres audience (Audience → Settings → Audience name and defaults). Optional if the account has only one audience. |
| `TECHSPHERES_INTEREST` | Optional. Name of the Mailchimp group for TechSpheres, if it isn't `atares TechSpheres`. |

Until `MAILCHIMP_API_KEY` is set, the form shows "The subscription is not available right now".

## Supabase

- `whitepapers`: catalog. The public can read rows with `is_published = true`. The home page shows the "All whitepapers" library once it lists two or more.
- `subscribers`: leads from both forms (`source` = `home-subscribe` or `report-gate`), with the exact consent text and timestamp, plus `mailchimp_status` and `report_released_at` for report-gate leads. **Not readable from the browser.** View it in the Supabase dashboard (Table editor).
- `subscribe(...)`: browser write path for the home page "notify me" form only. Report-gate leads must go through the `techspheres` function.

### Adding a whitepaper
1. Copy `whitepapers/industrial-tech-ma-2026.html`, change its content and `SLUG` in its form script.
2. Upload the PDF to the private `reports` bucket (dashboard → Storage).
3. Insert a row into `whitepapers` with the same `slug`, its `href` and `pdf_path`.
4. Update the "Latest" block in `index.html` if it is the new featured report.

## Not yet done
- Mailchimp secrets (see above).
- The home page "notify me" form only stores the address in Supabase. It does not add anyone to Mailchimp yet.
