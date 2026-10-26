# Store assets in the hub theme

`build.mjs` renders the icons, feature graphics, Microsoft Store art and framed screenshots that
the store listing kits in `learningwithliann-registry/STORE-LISTINGS/` point to. Everything is
drawn from the hub's own design: the porcelain tile with its Han glyph and accent corner
(`styles.css` `.tile`), Nunito for text, the dark hub palette (`--bg #121410`, `--fg #F8F1E5`,
`--accent #DE5A4F`, `--muted #B7AFA2`). Output goes to `store-assets/<product>/<store>/`, which
`.assetsignore` keeps out of the deployed site.

The committed Google Play icons and feature graphics for PolyFlow and AlongSide are curated
listing artwork. `build.mjs` leaves these files intact when refreshing the other store assets.
PolyFlow also has a Georgia typography variant in `store-assets/polyflow/google-play/polyflow-georgia/`.
Each listing icon is a full square with an opaque background; each feature graphic fills 1,024 × 500
without an outer frame.

```
node scripts/store-assets/build.mjs             # all products
node scripts/store-assets/build.mjs polyflow    # one product
```

Needs Chromium (`CHROME_PATH`, default `/opt/pw-browsers/chromium`) and a connection for Google
Fonts (Nunito, Noto Sans SC); without the fonts the glyphs fall back to the system CJK font.

## What is rendered

| Store | Files per product |
|---|---|
| Google Play | `icon-512.png` (32-bit PNG), `feature-1024x500.png`, `adaptive-foreground-432.png` + `adaptive-background-432.png` (Android adaptive icon layers for the app's own launcher icon), `phone-NN.png` (1,080 × 1,920), `tablet-NN.png` (1,920 × 1,080) |
| Microsoft Store | `tile-300.png` (1:1 app tile), `box-1080.png` (1:1 box art), `poster-720x1080.png` (2:3), `hero-1920x1080.png` (16:9 super hero), `desktop-NN.png` (1,920 × 1,080) |
| Apple App Store | `icon-1024.png` (no alpha) |

**PolyFlow on Google Play is hand-supplied.** `store-assets/polyflow/google-play/` (icon, feature graphic, phone and tablet screenshots) holds the
Georgia set made outside this generator and added on 26 Oct 2026 (it replaced the generated files). Running `build.mjs polyflow` writes the
generated set over it; restore these files from git if that happens. The adaptive icon layers there are still the generated ones.

Products, glyphs, one-liners and the screenshot captions are in `products.json`; the glyphs are
the ones the hub's Apps page uses (`src/config.js`).

## Captures

`captures/` holds the raw screenshots the frames are built from, taken on 24 October 2026 from
the shipped code served locally: PolyFlow from `lwl-backend` main (`public/music-app/polyflow/`,
0.1.0-preview with the 23 and 24 October updates) and the games from `pinyin-tiles-playtest`
main (`public/game`, `public/puzzle`, `public/tones`). Phone captures are 1,080 × 1,920 (a
432 × 768 or 360 × 640 viewport at 2.5× or 3×); desktop captures are 1,920 × 1,080.

Retake them when the apps change. The Mahjong Tones captures are of the web edition; the Microsoft
Store submission needs captures of the Windows build itself (see the kit). The Tiles and Puzzle
phone board captures were taken without the Pinyin API reachable: the page header and the match
status card are removed before the capture so the board fills the frame, and the Puzzle capture is
an element screenshot of the crossword panel (`.board-column`), 1,032 × 3,252, which the frame
crops from the top.
