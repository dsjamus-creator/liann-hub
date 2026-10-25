# Learning with LiANN hub

The browser hub for **app.lwliann.com**. It is a static web app with no build step: plain HTML, CSS and ES modules. Its look and menu follow the approved hub design (https://claude.ai/artifact/VtAytf4capbkRU6NDA35yh; also `learningwithliann-registry/HUB-MOCKUP/liann-hub.html`): Home, Apps, Library, Read, Figures, Discover, Kids, Shop, Downloads, Plan and Help. On phones the tab bar shows Home, Apps, Library and Downloads, and **More** opens the rest.

## What it does

| Page | Source of truth |
|---|---|
| Sign-in | Email code (Supabase, spec D16). The Supabase URL and publishable key come from the Pinyin API (`/v1/auth/config`) at run time, the same as in the games. No password, and no keys in this repo. |
| Who's learning? | The signed-in account. Family, Couple and Tutor profiles come later, once the backend has profiles (D15/D18). |
| Home, Apps, Discover | `src/config.js`. Pinyin Tiles and Pinyin Puzzle open on `playtest.lwliann.com`. **LiANN Pinyin Mahjong Tones is the Unity app here** (owner decision, 12 Oct 2026). The web edition stays on the playtest site, and the hub lists the Unity build from Downloads. |
| Library | The learner's AlongSide SetLists: `GET /learning/setlists` and `/learning/setlists/:id/words` with the Supabase bearer token. Read only, except the sharing below. With the plan probe answering, the signed-in adult's Library also has **Share** on each SetList (a plan holder sends it; a free account sees "Share · needs a plan" and, on refusal, a way to the plans page), **Shared with you** (Accept adds the person's own copy), **Shared by you** (Withdraw while it is waiting) and **Join a class** (a class code, which works only for an email the teacher listed). Never shown for a child profile. |
| Downloads, Read, Kids | `data/downloads.json`, a copy of the registry's `downloads/manifest.json`. A file is offered only when its entry has a file, a size and a SHA-256; a Kids card with no file is not shown at all (the reserved Flight colouring book has an entry in the manifest but no card until its PDF exists). |
| Figures | Early 3D models drawn in the browser with three.js r128 (MIT), served from `vendor/three-r128/` so the page's script policy stays `'self'`. It loads only when Figures opens. |
| Shop | The design's items, all "Coming soon" with prices to be set. Nothing can be bought yet. |
| Help | The FAQ with mini-guides (`data/faq.json`, shared with the website) and the support form with live chat (`src/support-widget.js`, the canonical copy lives in lwl-backend `public/support/`). Chat is offered only while a staff member has the Admin chat console open; otherwise the form takes a message and the reply comes by email. |
| Plan | The plan the account really holds (`GET /learning/account`: Free, Couple, Family, Teacher, PolyFlow Performance, or a Founder or Staff badge), account and sign-out, appearance, and the Learner, Tutor and Organisation plans. Every price says "Price to be set" and no card can be bought: owner decisions of 24 Oct 2026 are that an individual never pays and plans are for sharing. A **Teacher** section appears only for a Teacher plan (or founder or staff): onboarding with the Terms shown in full, then classes with a code, students listed by email (a child by a parent or guardian's), withdraw a seat, archive a class (`/learning/teacher/...`). A LiANN tutor keeps the AlongSide dashboard. |

Not in this version: profiles and permissions, buying plans or shop items (nothing turns a payment into a plan yet; entitlements are granted by hand), and comic reading. They need content or backend work first.

## Product pages

Every app has a public page at a stable address, `app.lwliann.com/<id>`: `/polyflow`, `/pinyin-tiles`,
`/pinyin-puzzle`, `/mahjong-tones`, `/alongside`, `/dual-subs`, `/lyricsync`. These are the landing pages the
store listings, guides and QR codes point at (registry `DEPLOYMENT-AND-STOREFRONT-PLAN (2026-10-24).md` §4).
The record for each is in `data/products.json`; `src/product.js` renders it with the hub's styles and theme,
and the page shows Open, a store badge (a disabled "Coming to …" until `storeUrl` is filled) or a Download from
the same record, the visitor's own platform first. Files come from `data/downloads.json` under the usual rule
(a file, its size and its SHA-256). `<id>.html` at the root is the page's shell; the Worker serves it at
`/<id>`, and `scripts/serve.mjs` does the same locally. The Apps and Home cards link to the pages with Details.

When a store listing goes live, put its public URL in `storeUrl` for that platform and the badge becomes a link.

## Run and test

```
npm install
npm start                 # http://localhost:4173/
npm test                  # unit tests (node:test), including tests/plans.test.mjs for plans, sharing and teaching
npm run test:smoke        # browser smoke test with mocked servers; set CHROME_PATH if Chromium isn't at /opt/pw-browsers/chromium
```

The smoke test covers:
- sign-in, including the email typo suggestion and a wrong code
- Who's learning?
- Home and search
- Library (SetList words)
- Downloads, Read and Kids
- the full menu, Discover, Shop and Plan, and the phone More tab
- plans, sharing and teaching: a free account (current plan, labelled Share, the refusal leading to the plans page, joining a class), a plan holder (accepting a list as a copy, sharing, withdrawing), a teacher (onboarding, a class, students by email, a seat withdrawn, a class archived), a founder, a LiANN tutor, and an AlongSide without the new routes
- the Figures 3D view and the first-visit tour
- appearance
- sign out
- a returning user without a learner profile

It runs at desktop and phone sizes, checks for sideways overflow, and fails on any console error.

## Updating downloads

Copy the registry's `downloads/manifest.json` to `data/downloads.json`. Each entry has a `producer`: `claude` for the Game 3 Unity package and test build, and `codex` for everything else. Entries need `hubSlot`, `name`, `file` (an https URL, or a path relative to `data/`), `bytes` and `sha256` before a Download button appears. The apps' `slot` values in `src/config.js` must exist in the manifest, and a unit test checks this.

Deploying is a separate, owner-approved step. See [docs/DEPLOY.md](docs/DEPLOY.md).

## Plans, sharing and teaching (AlongSide routes the hub calls)

All with the Supabase bearer token, under `/learning`, which AlongSide opens to this site's origin. A 404 means that AlongSide does not have the route yet, and the hub then shows none of the new screens.

| Call | Used for |
|---|---|
| `GET /learning/account` | The plans held and what the account may do (`plans`, `capabilities.shareSetlists`, `teachStudents`). |
| `GET /learning/setlists/shares`, `POST /learning/setlists/:id/shares`, `POST /learning/setlists/shares/:id/accept`, `.../revoke` | Share a SetList (the recipient gets their own copy), accept one, withdraw one. |
| `GET /learning/teacher/me`, `/policies`, `POST /onboard`, `GET` and `POST /classes`, `GET /classes/:id`, `POST /classes/:id/students`, `DELETE` a seat or a class | A teacher's onboarding and classes. Needs lwl-backend #179 (bearer access under `/learning/teacher`, and `DELETE` in the cross-origin preflight). |
| `POST /learning/class-code` | A learner joins a class with its code (also #179). |

A refusal that needs a plan shows a message and a **See plans** button to the hub's own Plan page. The hub never follows the address in the reply. The direct invite `POST /tutor/students/invite` is cookie-only on AlongSide, so from the hub a teacher lists a student as a class seat instead; emailed invites stay in AlongSide.
