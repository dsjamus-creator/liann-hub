# Deploying app.lwliann.com

The hub runs on Cloudflare Workers as a static-assets-only Worker named `liann-hub`. lwliann.com's DNS is already on Cloudflare, where the playtest site's Workers live. `wrangler.jsonc` attaches **app.lwliann.com** as a Workers *Custom Domain*, so the first deploy creates the DNS record and the HTTPS certificate itself. There's no DNS record to add by hand.

`.assetsignore` limits the upload to the site itself: `index.html`, `404.html`, `styles.css`, `_headers`, `src/`, `assets/` and `data/`. Tests, scripts, docs, `node_modules` and the config files stay private. This was checked with `wrangler dev`: those paths return 404.

The Worker also runs a little code, only for `/comic/*` (the protected comic pages): see `docs/COMIC-PROTECTION.md`. It needs the private `liann-reader` R2 bucket and a signing key that every deploy generates itself (`npm run deploy` does this too).

## Automatic deploys (GitHub Actions)

`.github/workflows/deploy.yml` runs the unit and browser tests, then deploys, on every push to `main`. You can also start it by hand: **Actions → Deploy hub → Run workflow**. Nothing is deployed if a test fails.

One-time setup, in this repo's **Settings → Secrets and variables → Actions → New repository secret**:
- `CLOUDFLARE_API_TOKEN`: a Workers token (Create Token → **Edit Cloudflare Workers** template, plus **Zone → DNS → Edit** for lwliann.com). Not the R2 downloads token.
- `CLOUDFLARE_ACCOUNT_ID`: the 32-character ID in the dashboard address (`dash.cloudflare.com/<account id>/home`).

Without both secrets the workflow still runs the tests and says the deploy was skipped.

## One-time deploy (owner, on a machine signed in to the Cloudflare account that holds lwliann.com)

```
git clone https://github.com/dsjamus-creator/liann-hub && cd liann-hub
git checkout main            # after the hub PR is merged
npm install
npx wrangler login           # opens the browser; no token goes into the repo
npm run deploy:check         # dry run: validates the config, uploads nothing
npm run deploy               # uploads the site and attaches app.lwliann.com
```

The certificate usually takes a few minutes. Then open https://app.lwliann.com/. Later deploys use `npm run deploy` only.

If `app.lwliann.com` already has a DNS record (for example a placeholder), Cloudflare refuses the Custom Domain. Delete that record in the Cloudflare dashboard (lwliann.com → DNS), then deploy again.

## Before sign-in and the Library work on the live hub

1. **lwl-backend CORS.** `/learning/*` only accepts browser calls from `https://playtest.lwliann.com`. Add `https://app.lwliann.com` for bearer-authenticated `/learning/*` calls (see the lwl-backend PR that does this), and deploy the backend.
2. **Pinyin API CORS.** `https://pinyin-tiles-api-staging.onrender.com/v1/auth/config` must answer CORS requests from `https://app.lwliann.com`. This wasn't checked: the cloud session's network can't reach onrender.com.
3. **Supabase.** Email-code (OTP) sign-in needs no redirect URL. If the email template uses a magic link rather than a code, add `https://app.lwliann.com` to the allowed redirect URLs.

Until those are done, the live hub shows its pages, apps and downloads, but sign-in and the Library show "Could not reach the server".

## Downloads bucket (downloads.lwliann.com)

App installers are too big for the hub itself (Workers allow 25 MiB per file) and can't be linked from private repos. They are served from the public R2 bucket **`liann-downloads`**, created on 12 Oct 2026 on the lwliann.com Cloudflare account.

1. Cloudflare → R2 → `liann-downloads` → Settings → **Custom Domains**: add `downloads.lwliann.com`.
2. Cloudflare → R2 → **Manage API tokens**: create a token with *Object Read & Write*, limited to `liann-downloads`. Add it to each app repo that publishes installers as the Actions secret `LIANN_DOWNLOADS_R2_TOKEN`, together with `CLOUDFLARE_ACCOUNT_ID`. The first one is lwl-backend, for PolyFlow (lwl-backend PR #114).
3. Each file lives at `<product>/<platform>/<version>/<file>` and never changes once published. When a file is uploaded, set its manifest entry's `file` to the full `https://downloads.lwliann.com/...` URL. The hub then shows Download, with the size and SHA-256.

## Later

- **One sign-in across the hub and the games.** The hub (`app.lwliann.com`) and the games (`playtest.lwliann.com`) are different origins, so learners sign in to each separately. To make it one sign-in, either serve the games from `app.lwliann.com` too, or add a token hand-off from the hub to the games.
- **Game 3.** The hub lists the Unity build from the `mahjong-tones/test-build` slot. It shows "Unity build on its way" until the signed build exists and the manifest entry has its file, size and SHA-256.
