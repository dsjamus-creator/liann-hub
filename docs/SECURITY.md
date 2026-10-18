# Security baseline for app.lwliann.com

A working checklist, not legal advice. Status: **Done** (in this repo, tested), **Owner** (needs the Cloudflare, Supabase, Render, Stripe, registrar or GitHub dashboards; Claude can write the exact steps), **Decide** (needs a product or legal decision).

The hub is a static site plus one small Worker (`worker/index.js`, comic pages only). It holds no database and no secrets of its own: sign-in is Supabase email codes, the Library and households live in AlongSide (lwl-backend on Render). Most of the risk to user details therefore sits in those services, so they are on this list too.

## In this repo (Done)

| Area | What | Where |
|---|---|---|
| Browser policy | Strict CSP: scripts only from the site itself (no inline, no eval), no plugins, no `<base>`, no form posts; connections only to the Pinyin API, AlongSide and Supabase | `index.html` |
| Clickjacking | `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` | `_headers` |
| HTTPS | `Strict-Transport-Security` for a year on app.lwliann.com (not `includeSubDomains`: the other lwliann.com sites are a separate decision) and `upgrade-insecure-requests` | `_headers` |
| Leaks | `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, camera/microphone/location/USB/Bluetooth/serial off | `_headers` |
| No secrets published | Only the site is uploaded (tests, docs, scripts, worker, config stay private); a test fails the build if a secret key, private key, API token or JWT appears in the published files | `.assetsignore`, `tests/security.test.mjs` |
| Sign-in | Email codes: no passwords to steal or reuse. Tokens are never logged | `src/account.js` |
| Comic protection | Private files, expiring signed links, no saving menu, watermark, rate limits | `docs/COMIC-PROTECTION.md` |
| Dependencies | `npm audit` is clean (0 vulnerabilities, including dev tools); Dependabot opens weekly update PRs for npm and GitHub Actions | `.github/dependabot.yml` |
| Reporting | `/.well-known/security.txt` tells researchers where to report a problem | `.well-known/security.txt` |
| Deploys | CI runs the tests before every deploy; the workflow has read-only repo permissions; the page-signing key is generated per deploy | `.github/workflows/deploy.yml` |

## Cloudflare (Owner)

- **SSL/TLS** → mode **Full (strict)**; **Always Use HTTPS** on; **Minimum TLS 1.2**; **Automatic HTTPS Rewrites** on.
- **Security → WAF**: turn on the **Cloudflare Managed Ruleset** and **OWASP Core Ruleset**. Add a **rate-limiting rule**: `http.host eq "app.lwliann.com" and http.request.uri.path eq "/comic/sign"`, 60 requests per minute per IP, action Block for 10 minutes.
- **Security → Bots**: **Bot Fight Mode** on. (Currently Cloudflare also blocks some automated tools by itself: that is how this dev environment gets "Your request was blocked".)
- **Turnstile** on the sign-in form (free): needs a small code change plus a site key. Claude can add the code once the key exists.
- **DNS**: enable **DNSSEC**; add **CAA** records (`0 issue "letsencrypt.org"`, `0 issue "pki.goog"`) for lwliann.com.
- **Email**: SPF, DKIM and **DMARC** for lwliann.com, starting at `p=none` with a `rua` report address, then `p=quarantine`, then `p=reject` once the reports show only your own mail (Resend, Supabase auth mail, Google). This is the single best protection against someone sending phishing "from" your domain.
- **Account**: 2FA with a hardware key or passkey on Cloudflare, the domain registrar (also turn on registrar lock), Google, GitHub, Supabase, Render and (later) Stripe.
- **Mailbox**: create `security@lwliann.com` (an alias is enough) so the address in `security.txt` is real.
- **API tokens**: delete the R2 upload token used earlier in the project. Keep the deploy token scoped to Workers only.

## GitHub (Owner)

- Repository → Settings → **Branches**: protect `main` (pull request required, no force-push, tests must pass).
- **Code security**: enable Dependabot alerts and security updates, **secret scanning** with push protection, and **code scanning (CodeQL)**.
- Require 2FA for everyone with access.

## Supabase (Owner)

- **Row Level Security on every table**, with policies that only let a user read and change their own rows (and a guardian their children's). No table without RLS. Run the Supabase **Security Advisor** and fix every warning.
- Keep the service-role key out of every browser and repo. Only the publishable key is public.
- Email OTP: keep 6 digits, short expiry (10 minutes or less), and the rate limits on the auth endpoints switched on. Add CAPTCHA/Turnstile in Auth settings when Turnstile exists.
- Turn on **Point-in-Time Recovery** or daily backups, and test one restore.
- Settings → Auth → **Redirect URLs**: only app.lwliann.com (and the games' address).

## Render / lwl-backend (Owner and Decide)

- **Staging API in production:** `src/config.js` points sign-in config at `pinyin-tiles-api-staging.onrender.com`. Real users and payments should use a production service. Decide the production address, then Claude changes `config.pinyinApi`, the CSP `connect-src`, and `PINYIN_API` in `wrangler.jsonc`.
- Every endpoint must check who is calling and that they own the record they ask for (children's profiles and SetLists especially). Test with two accounts trying to read each other's data.
- Make the backends accept browser traffic only from the app's origins (CORS allow-list, no `*`), and ideally only requests that came through Cloudflare, so a flood cannot skip Cloudflare by hitting the Render address.
- Validate all input on the server; use parameterised queries; log errors without personal data.
- Set Render environment secrets in the dashboard, never in code.

## Payments (Decide, before any is taken)

- Use **Stripe Checkout** or Payment Links: the card form is on Stripe's page, so card numbers never touch this site or the backends (PCI SAQ A).
- Mark an order paid only from a **webhook whose signature you verify**, never from the browser returning to the site.
- Use a restricted Stripe key stored as a secret on the backend. Never put a secret key in this repo (the build fails if one appears).
- When payments exist: add `https://js.stripe.com` and `https://checkout.stripe.com` to the CSP only for the pages that need them, and allow `payment=(self)` in `Permissions-Policy`.
- Keep receipts and refunds in Stripe; store only the Stripe customer and payment IDs, not card details.

## Privacy and children's data (Decide)

- The Plan page creates **child profiles under 13**: this brings in children's-data rules (UK GDPR and the ICO Children's Code; COPPA in the US). Keep guardian consent as it is, collect the minimum (first name and date of birth), no advertising or third-party trackers, and make data export and deletion available.
- Publish a privacy policy and terms (the Plan page already shows versioned ones) and keep them current. Register with the ICO if you are UK-based.
- Have a one-page incident plan: who decides, how to revoke tokens and sessions, and how to tell users and the regulator (within 72 hours under GDPR).

## Known limits and next code changes (Claude can do these)

- Sessions are kept in `localStorage`, so a script-injection bug would expose them. The CSP removes the usual way in. Moving to httpOnly cookies needs a backend change; do it before payments.
- Cloudflare Turnstile on sign-in (needs the site key).
- Per-user rate limits in the comic Worker are in memory, so they are a brake, not a guarantee. A Cloudflare rate-limiting rule (above) is the stronger version.
- `security.txt` expires on 2027-10-01: renew the date each year (a test fails after that date as a reminder).
