# Deploying app.lwliann.com (owner checklist)

Nothing here has been done. Each step needs the owner.

1. **Hosting.** Serve this repository's files as static files over HTTPS: `index.html`, `styles.css`, `src/`, `assets/` and `data/`. Any static host works.
   - Don't serve `tests/`, `scripts/`, `docs/` or `node_modules/`.
   - The page sets its own Content-Security-Policy in a `<meta>` tag. If the host adds a CSP header, it must allow the same `connect-src` hosts: the Pinyin API, `lwl-backend-mhgo.onrender.com` and `*.supabase.co`.
2. **DNS.** Point `app.lwliann.com` at the host.
3. **Backend CORS (lwl-backend).** `src/server.ts` and `src/gameRequestOrigin.ts` only accept browser calls to `/learning/*` from `https://playtest.lwliann.com`. Add `https://app.lwliann.com` for bearer-authenticated `/learning/*` reads, or the Library shows "Could not reach the server".
4. **Pinyin API CORS.** `https://pinyin-tiles-api-staging.onrender.com/v1/auth/config` must answer CORS requests from `https://app.lwliann.com`. This wasn't checked: the cloud session's network can't reach onrender.com.
5. **Supabase.** Email-code (OTP) sign-in needs no redirect URL. If the email template uses a magic link rather than a code, add `https://app.lwliann.com` to the allowed redirect URLs.
6. **One sign-in across the hub and the games.** The hub (`app.lwliann.com`) and the games (`playtest.lwliann.com`) are different origins, so a learner signs in to each separately. To make it one sign-in, either serve the games from `app.lwliann.com` too, or add a token hand-off from the hub to the games. That is a follow-up.
7. **Game 3.** The hub lists the Unity build from the `mahjong-tones/test-build` slot. It shows "Unity build on its way" until DSJ-PC produces a signed build and the manifest entry has its file, size and SHA-256.
