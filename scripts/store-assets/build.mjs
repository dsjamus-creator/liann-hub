// Renders the app-store assets in the hub's own theme: the porcelain tile with its Han glyph and
// accent corner, Nunito and Georgia, the dark hub palette. Output: store-assets/<product>/<store>/.
//
//   node scripts/store-assets/build.mjs            # every product in products.json
//   node scripts/store-assets/build.mjs polyflow   # one product
//
// Raw screenshots come from scripts/store-assets/captures/ (see README.md for how they were taken).
// Needs Chromium: set CHROME_PATH if it is not at /opt/pw-browsers/chromium.

import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const { products } = JSON.parse(readFileSync(join(here, 'products.json'), 'utf8'));
const only = process.argv[2];

// Tokens lifted from styles.css (:root and [data-ds="liann"]).
const T = {
  bg: '#121410', main: '#151813', card: '#1B1914', fg: '#F8F1E5', muted: '#B7AFA2', accent: '#DE5A4F',
  sage: '#8A9B7E', tileA: '#FFF7DF', tileB: '#FDEFCB', tileC: '#F4E2B8', tileRim: '#CFB996', tileEdge: '#947641', glyph: '#3D3C34',
  lightBg: '#FBF6EE', lightFg: '#2B2B28', lightAccent: '#C24837'
};
const FONTS = 'https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Noto+Sans+SC:wght@700&display=swap';
const css = `
  @import url('${FONTS}');
  *{box-sizing:border-box;margin:0}
  html,body{background:transparent}
  body{font-family:"Nunito",ui-rounded,"Segoe UI",system-ui,sans-serif;color:${T.fg}}
  .han{font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;font-weight:700}
  .tile{display:grid;place-items:center;border-radius:14%;background:linear-gradient(145deg,${T.tileA},${T.tileB} 46%,${T.tileC});
    border:1px solid ${T.tileRim};color:${T.glyph};font-family:"Noto Sans SC",sans-serif;font-weight:700;position:relative;overflow:hidden}
  .tile::after{content:"";position:absolute;right:0;top:0;width:22%;height:22%;background:${T.accent};clip-path:polygon(0 0,100% 0,100% 100%)}
  .tile.shadow{box-shadow:0 calc(var(--s) * .012) 0 ${T.tileEdge},0 calc(var(--s) * .03) calc(var(--s) * .06) rgba(60,40,10,.28)}
  .brand{display:flex;align-items:center;gap:.5em;font-weight:900;letter-spacing:.01em}
  .brand .b{font-size:.6em;font-weight:800;color:${T.muted}}
  .brand .n{color:${T.accent}}
  .dark{background:${T.bg}}
  .glow{position:absolute;inset:0;background:radial-gradient(90% 70% at 20% 30%,rgba(222,90,79,.18),transparent 60%),radial-gradient(60% 60% at 90% 90%,rgba(138,155,126,.16),transparent 60%)}
`;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const page = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}html,body{width:${w}px;height:${h}px;overflow:hidden}</style></head><body>${body}</body></html>`;

// The app icon: the hub tile filling the square, glyph centred. The stores apply their own corner masks
// (Play, Apple and the Microsoft tile all want full-bleed artwork), so square: true is the default use.
const icon = (p, size, { square = false } = {}) => page(size, size,
  `<div class="dark" style="width:${size}px;height:${size}px;display:grid;place-items:center;--s:${size}px">
     <div class="tile" style="width:${square ? size : size * 0.84}px;height:${square ? size : size * 0.84}px;font-size:${size * 0.5}px;border-radius:${square ? 0 : '14%'}">${p.glyph}</div>
   </div>`);

// Android adaptive icon layers (432 px, safe zone 264 px): foreground = tile, background = hub ground.
const adaptiveFg = (p, size = 432) => page(size, size,
  `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;--s:${size}px">
     <div class="tile" style="width:${size * 0.58}px;height:${size * 0.58}px;font-size:${size * 0.34}px">${p.glyph}</div>
   </div>`);
const adaptiveBg = (size = 432) => page(size, size, `<div class="dark" style="width:${size}px;height:${size}px"></div>`);

// Play feature graphic 1024 × 500: tile left, name and one line right, wordmark bottom right. Focal point kept central.
const feature = (p) => page(1024, 500,
  `<div class="dark" style="position:relative;width:1024px;height:500px;display:flex;align-items:center;gap:56px;padding:0 96px;--s:300px">
     <div class="glow"></div>
     <div class="tile shadow" style="width:236px;height:236px;font-size:132px;flex:none">${p.glyph}</div>
     <div style="position:relative;display:grid;gap:14px;min-width:0">
       <div style="font-size:${p.name.length > 18 ? 54 : 68}px;font-weight:900;line-height:1.05;text-wrap:balance">${esc(p.name)}</div>
       <div style="font-size:26px;color:${T.muted};line-height:1.3">${esc(p.line)}</div>
       <div class="brand" style="font-size:22px;margin-top:10px"><span class="b">Learning with</span><span class="n">LiANN</span></div>
     </div>
   </div>`);

// Microsoft 16:9 super hero art and 2:3 poster share the feature layout at other sizes; box art is the icon on the ground.
const hero = (p) => page(1920, 1080,
  `<div class="dark" style="position:relative;width:1920px;height:1080px;display:flex;align-items:center;gap:110px;padding:0 200px;--s:560px">
     <div class="glow"></div>
     <div class="tile shadow" style="width:440px;height:440px;font-size:250px;flex:none">${p.glyph}</div>
     <div style="position:relative;display:grid;gap:26px;min-width:0">
       <div style="font-size:${p.name.length > 18 ? 96 : 124}px;font-weight:900;line-height:1.05;text-wrap:balance">${esc(p.name)}</div>
       <div style="font-size:46px;color:${T.muted};line-height:1.3">${esc(p.line)}</div>
       <div class="brand" style="font-size:40px;margin-top:16px"><span class="b">Learning with</span><span class="n">LiANN</span></div>
     </div>
   </div>`);
const poster = (p) => page(720, 1080,
  `<div class="dark" style="position:relative;width:720px;height:1080px;display:grid;align-content:center;justify-items:center;gap:44px;padding:0 64px;text-align:center;--s:340px">
     <div class="glow"></div>
     <div class="tile shadow" style="width:340px;height:340px;font-size:196px">${p.glyph}</div>
     <div style="position:relative;display:grid;gap:18px">
       <div style="font-size:${p.name.length > 18 ? 54 : 66}px;font-weight:900;line-height:1.05;text-wrap:balance">${esc(p.name)}</div>
       <div style="font-size:26px;color:${T.muted};line-height:1.3">${esc(p.line)}</div>
       <div class="brand" style="font-size:24px;justify-content:center;margin-top:8px"><span class="b">Learning with</span><span class="n">LiANN</span></div>
     </div>
   </div>`);

// Screenshot frames: hub ground, a caption of at most one line (well under 20% of the height), the capture below with rounded corners.
const framePhone = (p, src, caption) => page(1080, 1920,
  `<div class="dark" style="position:relative;width:1080px;height:1920px;padding:72px 60px 0;display:grid;grid-template-rows:auto 1fr;gap:40px">
     <div class="glow"></div>
     <div style="position:relative;display:grid;gap:14px">
       <div class="brand" style="font-size:30px"><span class="tile" style="width:44px;height:44px;font-size:24px;border-radius:10px">${p.glyph}</span><span class="b">Learning with</span><span class="n">LiANN</span></div>
       <div style="font-size:52px;font-weight:900;line-height:1.15;text-wrap:balance">${esc(caption)}</div>
     </div>
     <div style="position:relative;border-radius:36px 36px 0 0;overflow:hidden;border:2px solid rgba(248,241,229,.14);border-bottom:0;background:#000">
       <img src="${src}" style="display:block;width:100%;height:100%;object-fit:cover;object-position:top">
     </div>
   </div>`);
const frameDesktop = (p, src, caption) => page(1920, 1080,
  `<div class="dark" style="position:relative;width:1920px;height:1080px;padding:56px 120px 0;display:grid;grid-template-rows:auto 1fr;gap:34px">
     <div class="glow"></div>
     <div style="position:relative;display:flex;align-items:baseline;gap:28px">
       <div class="brand" style="font-size:26px;flex:none"><span class="tile" style="width:38px;height:38px;font-size:20px;border-radius:9px">${p.glyph}</span><span class="b">Learning with</span><span class="n">LiANN</span></div>
       <div style="font-size:40px;font-weight:900;line-height:1.15">${esc(caption)}</div>
     </div>
     <div style="position:relative;border-radius:22px 22px 0 0;overflow:hidden;border:2px solid rgba(248,241,229,.14);border-bottom:0;background:#000">
       <img src="${src}" style="display:block;width:100%;height:100%;object-fit:cover;object-position:top">
     </div>
   </div>`);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const tab = await ctx.newPage();
async function render(html, w, h, out, { omitBackground = false } = {}) {
  mkdirSync(dirname(out), { recursive: true });
  await tab.setViewportSize({ width: w, height: h });
  await tab.setContent(html, { waitUntil: 'networkidle' });
  await tab.evaluate(() => document.fonts.ready);
  await tab.waitForTimeout(150);
  await tab.screenshot({ path: out, omitBackground, clip: { x: 0, y: 0, width: w, height: h } });
  console.log(out.replace(root + '/', ''));
}
// Captures are embedded as data URIs: a page set with setContent cannot load file:// images.
const capture = name => 'data:image/png;base64,' + readFileSync(join(here, 'captures', name + '.png')).toString('base64');

for (const p of products) {
  if (only && p.id !== only) continue;
  const base = join(root, 'store-assets', p.id);
  if (p.stores.includes('google-play')) {
    const d = join(base, 'google-play');
    await render(icon(p, 512, { square: true }), 512, 512, join(d, 'icon-512.png')); // Play applies its own mask to full-bleed artwork
    await render(feature(p), 1024, 500, join(d, 'feature-1024x500.png'));
    await render(adaptiveFg(p), 432, 432, join(d, 'adaptive-foreground-432.png'), { omitBackground: true });
    await render(adaptiveBg(), 432, 432, join(d, 'adaptive-background-432.png'));
    for (const [i, [name, caption]] of p.phone.entries()) {
      if (!existsSync(join(here, 'captures', name + '.png'))) continue;
      await render(framePhone(p, capture(name), caption), 1080, 1920, join(d, `phone-${String(i + 1).padStart(2, '0')}.png`));
    }
    for (const [i, [name, caption]] of p.desktop.entries()) {
      if (!existsSync(join(here, 'captures', name + '.png'))) continue;
      await render(frameDesktop(p, capture(name), caption), 1920, 1080, join(d, `tablet-${String(i + 1).padStart(2, '0')}.png`));
    }
  }
  if (p.stores.includes('microsoft-store')) {
    const d = join(base, 'microsoft-store');
    await render(icon(p, 300, { square: true }), 300, 300, join(d, 'tile-300.png'));
    await render(icon(p, 1080, { square: true }), 1080, 1080, join(d, 'box-1080.png'));
    await render(poster(p), 720, 1080, join(d, 'poster-720x1080.png'));
    await render(hero(p), 1920, 1080, join(d, 'hero-1920x1080.png'));
    for (const [i, [name, caption]] of p.desktop.entries()) {
      if (!existsSync(join(here, 'captures', name + '.png'))) continue;
      await render(frameDesktop(p, capture(name), caption), 1920, 1080, join(d, `desktop-${String(i + 1).padStart(2, '0')}.png`));
    }
  }
  if (p.stores.includes('apple-app-store')) {
    const d = join(base, 'apple-app-store');
    await render(icon(p, 1024, { square: true }), 1024, 1024, join(d, 'icon-1024.png'));
  }
}
await browser.close();
