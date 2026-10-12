# Learning with LiANN hub

The browser hub for **app.lwliann.com**. It is a static web app with no build step: plain HTML, CSS and ES modules. Its look follows the approved mockup (`learningwithliann-registry/HUB-MOCKUP/liann-hub.html`).

## What it does

| Page | Source of truth |
|---|---|
| Sign-in | Email code (Supabase, spec D16). The Supabase URL and publishable key come from the Pinyin API (`/v1/auth/config`) at run time, the same as in the games. No password, and no keys in this repo. |
| Who's learning? | The signed-in account. Family, Couple and Tutor profiles come later, once the backend has profiles (D15/D18). |
| Home, Apps | `src/config.js`. Pinyin Tiles and Pinyin Puzzle open on `playtest.lwliann.com`. **LiANN Pinyin Mahjong Tones is the Unity app here** (owner decision, 12 Oct 2026). The web edition stays on the playtest site, and the hub lists the Unity build from Downloads. |
| Library | The learner's AlongSide SetLists: `GET /learning/setlists` and `/learning/setlists/:id/words` with the Supabase bearer token. Read only. |
| Downloads, Read, Kids | `data/downloads.json`, a copy of the registry's `downloads/manifest.json`. A file is offered only when its entry has a file, a size and a SHA-256. |
| Settings | Account, sign out, and appearance (the five Pinyin Tiles design systems, light or dark). |

Not in this version: Shop, Figures (parked), Discover, profiles and permissions, plans and payments, and comic reading. They need content or backend work first.

## Run and test

```
npm install
npm start                 # http://localhost:4173/
npm test                  # unit tests (node:test)
npm run test:smoke        # browser smoke test with mocked servers; set CHROME_PATH if Chromium isn't at /opt/pw-browsers/chromium
```

The smoke test covers:
- sign-in, including the email typo suggestion and a wrong code
- Who's learning?
- Home and search
- Library (SetList words)
- Downloads, Read and Kids
- appearance
- sign out
- a returning user without a learner profile

It runs at desktop and phone sizes, checks for sideways overflow, and fails on any console error.

## Updating downloads

Copy the registry's `downloads/manifest.json` to `data/downloads.json`. Entries need `hubSlot`, `name`, `file` (an https URL, or a path relative to `data/`), `bytes` and `sha256` before a Download button appears. The apps' `slot` values in `src/config.js` must exist in the manifest, and a unit test checks this.

Deploying is a separate, owner-approved step. See [docs/DEPLOY.md](docs/DEPLOY.md).
