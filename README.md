# Learning with LiANN hub

The browser hub for **app.lwliann.com**. It is a static web app with no build step: plain HTML, CSS and ES modules. Its look and menu follow the approved hub design (https://claude.ai/artifact/VtAytf4capbkRU6NDA35yh; also `learningwithliann-registry/HUB-MOCKUP/liann-hub.html`): Home, Apps, Library, Read, Figures, Discover, Kids, Shop, Downloads and Plan. On phones the tab bar shows Home, Apps, Library and Downloads, and **More** opens the rest.

## What it does

| Page | Source of truth |
|---|---|
| Sign-in | Email code (Supabase, spec D16). The Supabase URL and publishable key come from the Pinyin API (`/v1/auth/config`) at run time, the same as in the games. No password, and no keys in this repo. |
| Who's learning? | The signed-in account. Family, Couple and Tutor profiles come later, once the backend has profiles (D15/D18). |
| Home, Apps, Discover | `src/config.js`. Pinyin Tiles and Pinyin Puzzle open on `playtest.lwliann.com`. **LiANN Pinyin Mahjong Tones is the Unity app here** (owner decision, 12 Oct 2026). The web edition stays on the playtest site, and the hub lists the Unity build from Downloads. |
| Library | The learner's AlongSide SetLists: `GET /learning/setlists` and `/learning/setlists/:id/words` with the Supabase bearer token. Read only. |
| Downloads, Read, Kids | `data/downloads.json`, a copy of the registry's `downloads/manifest.json`. A file is offered only when its entry has a file, a size and a SHA-256; a Kids card with no file is not shown at all (the reserved Flight colouring book has an entry in the manifest but no card until its PDF exists). |
| Figures | Early 3D models drawn in the browser with three.js r128 (MIT), served from `vendor/three-r128/` so the page's script policy stays `'self'`. It loads only when Figures opens. |
| Shop | The design's items, all "Coming soon" with prices to be set. Nothing can be bought yet. |
| Plan | The current plan (Free), account and sign-out, appearance, and the Learner, Tutor and Organisation plans. Plans other than Free say "Coming soon". |

Not in this version: profiles and permissions, buying plans or shop items, and comic reading. They need content or backend work first.

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
- the full menu, Discover, Shop and Plan, and the phone More tab
- the Figures 3D view and the first-visit tour
- appearance
- sign out
- a returning user without a learner profile

It runs at desktop and phone sizes, checks for sideways overflow, and fails on any console error.

## Updating downloads

Copy the registry's `downloads/manifest.json` to `data/downloads.json`. Each entry has a `producer`: `claude` for the Game 3 Unity package and test build, and `codex` for everything else. Entries need `hubSlot`, `name`, `file` (an https URL, or a path relative to `data/`), `bytes` and `sha256` before a Download button appears. The apps' `slot` values in `src/config.js` must exist in the manifest, and a unit test checks this.

Deploying is a separate, owner-approved step. See [docs/DEPLOY.md](docs/DEPLOY.md).
