# Production Pinyin Tiles API: setup plan

Status: **plan, nothing deployed.** Written 2026-10-19 from the `wordforge` repo (`pinyin-tiles/api`) and the live Render/Supabase accounts.

## Where things stand

| Piece | Today | Production target |
|---|---|---|
| API service | `pinyin-tiles-api-staging` (Render, branch `main`). The hub uses this. | `pinyin-tiles-api` (Render, srv-da7ldhbm6pss73e55vb0), branch `production`, **idle**: no traffic for 30 days, auth disabled |
| Sign-in (Supabase) | `pinyin-tiles-staging` (`mznljakkdafbqmapqncd`), 11 users | `pinyin-tiles-production` (`wpphyjnrjvpnvzpdntov`), empty, no tables |
| API database | Staging Postgres (not inspected) | **New Render Postgres**, same region as the service (Frankfurt) |
| Origins | staging sites | `https://pinyintiles.com`, `https://app.lwliann.com`, `https://www.lwliann.com` |

The API keeps its own data (matches, canonical accounts, playtest responses) in the Postgres at `DATABASE_URL` and builds its schema at startup. Supabase is used for **sign-in only**.

## 1. Branch (repo `wordforge`)

Create a `production` branch from a tested `main` commit. Point the Render service at it (Settings → Branch) with auto-deploy **off**, so production changes only when someone promotes a commit (`git push origin <tested-commit>:production`). The service already uses the README's build and start commands (`pnpm install --frozen-lockfile && pnpm run build`, `pnpm start`, root `pinyin-tiles/api`, health `/healthz`).

## 2. Database

Render → New → PostgreSQL, Frankfurt, paid plan with daily backups. Use its **internal** connection string for `DATABASE_URL` (no `DATABASE_SSL`).

## 3. Supabase `pinyin-tiles-production` (dashboard, owner)

1. Authentication → Providers: email on, **one-time code** and magic link; decide whether sign-in may create users.
2. Authentication → URL Configuration: Site URL `https://pinyintiles.com`; redirect URLs: exactly the callback URLs below, no wildcards.
3. Custom SMTP (verify SPF, DKIM, DMARC on the sending domain) and the shared sign-in email template (`docs/authentication/SUPABASE-MAGIC-LINK-TEMPLATE.html` in `wordforge`, subject `Your Learning with LiAnn sign-in link`).
4. OTP expiry 10 minutes or less; keep the auth rate limits on; CAPTCHA/Turnstile later.
5. Asymmetric JWT signing keys. Record the issuer, audience and JWKS URL.
6. Backups on. The API reaches only Auth here, so the project needs no tables.

## 4. Render environment (`pinyin-tiles-api`)

Set in the Render dashboard, never in git or chat. Secrets are marked **S**.

| Variable | Value |
|---|---|
| `DATABASE_URL` **S** | internal URL of the new Postgres |
| `ALLOWED_ORIGINS` | `https://pinyintiles.com,https://app.lwliann.com,https://www.lwliann.com` (add the Pinyin Puzzle and playtest origins if they stay) |
| `PINYIN_AUTH_ENABLED` | `false` until step 6 |
| `SUPABASE_URL` | `https://wpphyjnrjvpnvzpdntov.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | production publishable key (`sb_publishable_…`, public) |
| `SUPABASE_JWT_ISSUER` | `https://wpphyjnrjvpnvzpdntov.supabase.co/auth/v1` (confirm against the project's JWT settings) |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` |
| `SUPABASE_JWKS_URL` | issuer + `/.well-known/jwks.json` (confirm) |
| `AUTH_ALLOWED_CALLBACK_URLS` | `https://pinyintiles.com/auth/callback/supabase,https://app.lwliann.com/auth/callback/supabase,https://www.lwliann.com/auth/callback/supabase` |
| `AUTH_ALLOWED_LOGOUT_URLS` | `https://pinyintiles.com/,https://app.lwliann.com/,https://www.lwliann.com/` |
| `RESEND_API_KEY` **S** | sending-only key for the verified sender domain |
| `PINYIN_TRANSACTIONAL_FROM_EMAIL` | `no-reply@auth.pinyintiles.com` |
| `PINYIN_PUBLIC_APP_URL` | `https://pinyintiles.com` |
| `PLAYTEST_REPORT_TOKEN` **S** | long random value |
| `PINYIN_ALONGSIDE_LINK_ENABLED` | `0` (the link allow-list in `config.ts` does not yet include a production AlongSide URL beyond `lwliann.com`) |

Note: the API sends one callback and logout URL per requesting origin, and the origin must be in `ALLOWED_ORIGINS`, so all three sites need entries in all three lists.

## 5. Custom domain for the API

Use a production address such as `api.pinyintiles.com` (Render custom domain + DNS), so the hub does not depend on an `onrender.com` address. The values below assume that name; change them if another is chosen.

## 6. Order of verification (from the repo's own runbook)

1. Deploy with auth off; check `/healthz` and `/v1/auth/config` (`{"authentication":{"enabled":false}}`), and guest play.
2. Turn `PINYIN_AUTH_ENABLED` on in production only after steps 3 and 4 are complete.
3. Confirm `/v1/auth/config` returns the production `supabaseUrl` and that CORS allows `https://app.lwliann.com`.
4. Sign in with a test account on the hub from a phone and a laptop; confirm the player ID email.
5. Run the repo's security checklist, review the logs for leaked tokens or emails, get owner sign-off.

## 7. Hub switch (this repo)

After step 6 passes, change `https://pinyin-tiles-api-staging.onrender.com` to the production API address in `src/config.js`, the CSP `connect-src` in `index.html`, `PINYIN_API` in `wrangler.jsonc`, `tests/smoke.mjs`, and `docs/SECURITY.md` and `docs/DEPLOY.md`. Deploy through the normal pipeline. Existing staging accounts do not carry over; the people who matter sign in again.

## Rollback

Set `PINYIN_AUTH_ENABLED=false` and redeploy the API; the hub keeps working for guests. To go back to staging, revert the hub switch.
