# Deploying app.lwliann.com

The hub runs on a Cloudflare Worker named `liann-hub`. lwliann.com's DNS is already on Cloudflare, where the playtest site's Workers live. `wrangler.jsonc` attaches **app.lwliann.com** as a Workers *Custom Domain*, so the first deploy creates the DNS record and the HTTPS certificate itself. There's no DNS record to add by hand.

`.assetsignore` limits the upload to the site itself: `index.html`, `404.html`, `styles.css`, `_headers`, `src/`, `assets/` and `data/`. Tests, scripts, docs, `node_modules` and the config files stay private. This was checked with `wrangler dev`: those paths return 404.

The Worker handles `/comic/*` (protected comic pages) and `/session/*` (email-code verification, refresh and local sign-out). See `docs/COMIC-PROTECTION.md`. It needs the private `liann-reader` R2 bucket and separate `SIGNING_KEY` and `SESSION_KEY` Worker secrets. A deployment preserves the keys, so short-lived links and signed-in browser sessions remain valid across code releases. The session refresh token is encrypted into a host-only HttpOnly cookie; page JavaScript keeps only an access token in memory. Existing browser-stored sessions are discarded at rollout, so users enter a new email code once.

## Automatic deploys (GitHub Actions)

`.github/workflows/deploy.yml` runs the unit and browser tests, then deploys, on every push to `main`. You can also start it by hand: **Actions → Deploy hub → Run workflow**. Nothing is deployed if a test fails.

One-time setup, in this repo's **Settings → Secrets and variables → Actions → New repository secret**:
- `CLOUDFLARE_API_TOKEN`: a Workers token (Create Token → **Edit Cloudflare Workers** template, plus **Zone → DNS → Edit** for lwliann.com). Not the R2 downloads token.
- `CLOUDFLARE_ACCOUNT_ID`: the 32-character ID in the dashboard address (`dash.cloudflare.com/<account id>/home`).
- `HUB_SIGNING_KEY`: a 64-character lowercase hex value. Generate it once with a secure random-number generator; keep it in Actions secrets, not source. The deploy workflow uploads it as a Cloudflare Worker secret.
- `HUB_SESSION_KEY`: a **different** 64-character lowercase hex value, generated independently. The deploy workflow uploads it as the `SESSION_KEY` Worker secret. Preserve it across deploys; rotating it signs out existing hub browsers.

Without all four secrets the workflow still runs the tests and says the deploy was skipped.

## One-time deploy (owner, on a machine signed in to the Cloudflare account that holds lwliann.com)

```
git clone https://github.com/dsjamus-creator/liann-hub && cd liann-hub
git checkout main            # after the hub PR is merged
npm install
npx wrangler login           # opens the browser; no token goes into the repo
npm run deploy:check         # dry run: validates the config, uploads nothing
npm run deploy               # uploads the site and attaches app.lwliann.com
```

For a brand-new Worker, generate two independent 64-character lowercase hex keys. Set them as `SIGNING_KEY` and `SESSION_KEY` with `npx wrangler secret put`, and set the same values as the corresponding GitHub Actions secrets. A later manual `npm run deploy` preserves those Worker secrets. The certificate usually takes a few minutes. Then open https://app.lwliann.com/.

If `app.lwliann.com` already has a DNS record (for example a placeholder), Cloudflare refuses the Custom Domain. Delete that record in the Cloudflare dashboard (lwliann.com → DNS), then deploy again.

## Before sign-in and the Library work on the live hub

1. **lwl-backend CORS.** `/learning/*` only accepts browser calls from `https://playtest.lwliann.com`. Add `https://app.lwliann.com` for bearer-authenticated `/learning/*` calls (see the lwl-backend PR that does this), and deploy the backend.
2. **Pinyin API CORS.** `https://api.pinyintiles.com/v1/auth/config` must answer CORS requests from `https://app.lwliann.com` (`app.lwliann.com` is in the API's `ALLOWED_ORIGINS`). Sign-in from the live hub has been checked by hand; the cloud session's network can't reach the API itself.
3. **Supabase.** The hub uses the email code. If the email also contains an implicit magic link, the hub refuses tokens in its URL fragment and asks the user to type the code instead. Keep `https://app.lwliann.com` on the allowed redirect URLs so the link returns to the hub for a safe explanation; ideally update the email template to emphasize the code.

Until those are done, the live hub shows its pages, apps and downloads, but sign-in and the Library show "Could not reach the server".

## Downloads bucket (downloads.lwliann.com)

App installers are too big for the hub itself (Workers allow 25 MiB per file) and can't be linked from private repos. They are served from the public R2 bucket **`liann-downloads`**, created on 12 Oct 2026 on the lwliann.com Cloudflare account.

1. Cloudflare → R2 → `liann-downloads` → Settings → **Custom Domains**: add `downloads.lwliann.com`.
2. Cloudflare → R2 → **Manage API tokens**: create a token with *Object Read & Write*, limited to `liann-downloads`. Add it to each app repo that publishes installers as the Actions secret `LIANN_DOWNLOADS_R2_TOKEN`, together with `CLOUDFLARE_ACCOUNT_ID`. The first one is lwl-backend, for PolyFlow (lwl-backend PR #114).
3. Each file lives at `<product>/<platform>/<version>/<file>` and never changes once published. When a file is uploaded, set its manifest entry's `file` to the full `https://downloads.lwliann.com/...` URL. The hub then shows Download, with the size and SHA-256.

## Later

- **One sign-in across the hub and the games.** The hub (`app.lwliann.com`) and the games (`playtest.lwliann.com`) are different origins, so learners sign in to each separately. To make it one sign-in, either serve the games from `app.lwliann.com` too, or add a token hand-off from the hub to the games.
- **Game 3.** The hub lists the Unity build from the `mahjong-tones/test-build` slot. It shows "Unity build on its way" until the signed build exists and the manifest entry has its file, size and SHA-256.
