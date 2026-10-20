// Browser smoke test: the whole hub against mocked Pinyin API, Supabase and AlongSide. No real network.
// CHROME_PATH defaults to the Chromium preinstalled in Claude Code cloud sessions.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import { serve } from '../scripts/serve.mjs'

const server = await serve(0)
const url = `http://127.0.0.1:${server.address().port}/`
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' })
const LIST = '11111111-2222-4333-8444-555555555555'
let failures = 0
const shot = async (page, name) => { if (process.env.SHOTS) await page.waitForTimeout(400), await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }) }

async function mock(context, { student = true, tour = false } = {}) {
  const seen = { auth: [] }
  if (!tour) await context.addInitScript(() => localStorage.setItem('liann-hub-tour-done', 'true'))
  const PAGE = n => `https://downloads.lwliann.com/comics/ep1/page-${n}.jpg`
  await context.route('**/data/comics.json', r => r.fulfill({ json: { episodes: [{ id: 'ep1', title: 'Episode 1: Flight', number: 1, summary: 'Bella takes off.', cover: PAGE(1), pages: [PAGE(1), PAGE(2), PAGE(3)] },
    { id: 'ep2', title: 'Episode 2: Long', number: 2, summary: 'A longer book.', cover: PAGE(1), pages: [PAGE(1), PAGE(2), PAGE(3), PAGE(1), PAGE(2), PAGE(3)] },
    { id: 'ep3', title: 'Episode 3: Private', number: 3, summary: 'Protected pages.', cover: PAGE(1), pages: ['comic/ep-03/p1.webp', 'comic/ep-03/p2.webp', 'comic/ep-03/p3.webp'] }] } }))
  seen.signs = []
  await context.route('**/comic/sign', r => {
    const body = r.request().postDataJSON(); seen.signs.push({ auth: r.request().headers().authorization, paths: body.paths })
    return r.fulfill({ json: { expires: Math.floor(Date.now() / 1000) + 1800, urls: Object.fromEntries(body.paths.map(p => [p, `${p}?e=1&u=abcdef012345&s=${'a'.repeat(40)}`])) } })
  })
  await context.route(/\/comic\/ep-03\/p\d\.webp\?/, r => r.fulfill({ path: fileURLToPath(new URL('./fixtures/page-1.jpg', import.meta.url)), contentType: 'image/jpeg' }))
  await context.route(/downloads\.lwliann\.com\/comics\/ep1\/page-(\d)\.jpg/, r => r.fulfill({ path: fileURLToPath(new URL(`./fixtures/page-${r.request().url().match(/page-(\d)/)[1]}.jpg`, import.meta.url)), contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' } }))
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await context.route('https://api.pinyintiles.com/v1/auth/config', r => r.fulfill({ json: { authentication: { enabled: true, supabaseUrl: 'https://demo.supabase.co', publishableKey: 'pk-test' } } }))
  await context.route('https://demo.supabase.co/auth/v1/**', async r => {
    const u = new URL(r.request().url()), body = r.request().postDataJSON?.() || {}
    seen.auth.push(u.pathname)
    if (u.pathname.endsWith('/otp')) return r.fulfill({ json: {} })
    if (u.pathname.endsWith('/verify')) return body.token === '246810'
      ? r.fulfill({ json: { access_token: 'at', refresh_token: 'rt', expires_in: 3600, user: { email: body.email } } })
      : r.fulfill({ status: 403, json: { error_code: 'otp_expired' } })
    if (u.pathname.endsWith('/user')) return r.fulfill({ json: { email: 'ann.mingen@example.com', email_confirmed_at: '2026-10-12T00:00:00Z' } })
    if (u.pathname.endsWith('/logout')) return r.fulfill({ status: 204, body: '' })
    return r.fulfill({ status: 404, json: {} })
  })
  await context.route('https://lwl-backend-mhgo.onrender.com/learning/**', r => {
    assert.equal(r.request().headers().authorization, 'Bearer at')
    const p = new URL(r.request().url()).pathname
    if (!student && p === '/learning/session-pass') { seen.pass = r.request().postDataJSON(); return r.fulfill({ json: { url: 'https://lwl-backend-mhgo.onrender.com/auth/liann/continue#pass=test-pass', expiresInSeconds: 60 } }) }
    if (!student) return r.fulfill({ status: 403, json: { error: 'not_a_student', profile: { url: 'https://lwl-backend-mhgo.onrender.com/student#profile', sessionPass: { url: 'https://lwl-backend-mhgo.onrender.com/learning/session-pass', next: '/student#profile' } } } })
    if (p === '/learning/setlists') return r.fulfill({ json: { ok: true, setlists: [{ id: LIST, name: 'Tone pairs I miss', words: 2, source_product: 'liann-mahjong-tones' }] } })
    if (p === `/learning/setlists/${LIST}/words`) return r.fulfill({ json: { ok: true, name: 'Tone pairs I miss', words: [{ hz: '一般', py: 'yìbān', gl: 'ordinary', source_product: 'liann-mahjong-tones' }, { hz: '一半', py: 'yíbàn', gl: 'half' }] } })
    return r.fulfill({ status: 404, json: {} })
  })
  return seen
}

async function step(name, fn) {
  try { await fn(); console.log(`ok   ${name}`) } catch (e) { failures++; console.log(`FAIL ${name}\n     ${e.message.slice(0, 600)}`) }
}

async function noOverflow(page) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
  assert.ok(w[0] <= w[1], `page scrolls sideways: ${w[0]} > ${w[1]}`)
}

for (const viewport of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
  const tag = viewport.width < 500 ? 'phone' : 'desktop'
  const context = await browser.newContext({ viewport })
  const seen = await mock(context)
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  // The wrong-code step deliberately gets a 403 from /verify; Chromium logs that as a console error.
  // Households switched off: AlongSide answers /learning/household with 404, which the hub reads as "no households".
  page.on('console', m => { if (m.type() === 'error' && !(/status of 403/.test(m.text()) && m.location().url.endsWith('/auth/v1/verify'))
    && !(/status of 404/.test(m.text()) && m.location().url.includes('/learning/household'))) errors.push(m.text()) })
  await page.goto(url)

  await step(`${tag}: email typo is caught, then a code is sent`, async () => {
    await page.fill('#em', 'ann.mingen@gmil.com')
    await page.click('#f1 [type=submit]')
    await page.locator('#usefix').click()
    assert.equal(await page.inputValue('#em'), 'ann.mingen@gmail.com')
    await page.click('#f1 [type=submit]')
    await page.locator('#f2').waitFor()
    assert.ok(seen.auth.some(p => p.endsWith('/otp')))
  })
  await step(`${tag}: a wrong code is refused with a clear message`, async () => {
    assert.equal(await page.locator('#f2 .code input').count(), 6, 'one six-digit code for every sign-in (owner, 13 Oct 2026)')
    assert.match(await page.locator('#linknote').innerText(), /don't tap the sign-in link/, 'the email link uses up the code, so the screen says not to tap it')
    await page.locator('#c0').pressSequentially('111111')
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').innerText(), /wrong or has expired/)
  })
  await step(`${tag}: the right code, dropped into the first box by autofill, signs in and shows "Who's learning?"`, async () => {
    assert.equal(await page.locator('#c0').getAttribute('autocomplete'), 'one-time-code')
    assert.equal(await page.locator('#c0').getAttribute('maxlength'), null, 'autofill must fit a whole code in the first box')
    await page.locator('#c0').evaluate(el => { el.value = '246810'; el.dispatchEvent(new Event('input', { bubbles: true })) })
    await page.locator('#pick').waitFor()
    assert.match(await page.locator('.who').innerText(), /Ann Mingen/)
  })
  await step(`${tag}: hub home opens web Mahjong Tones`, async () => {
    await page.click('#pick')
    await page.locator('.hello').waitFor()
    const tones = page.locator('[data-app="tones"]').first()
    assert.match(await tones.innerText(), /web and Windows/)
    assert.equal(await tones.locator('a[href*="/playtest/Tones"]').getAttribute('href'), 'https://playtest.lwliann.com/playtest/Tones')
    assert.equal(await page.locator('[data-app="tiles"] a').first().getAttribute('href'), 'https://playtest.lwliann.com/playtest/game/')
    await noOverflow(page); await shot(page, `${tag}-home`)
  })
  await step(`${tag}: search filters games, apps and SetLists`, async () => {
    await page.fill('#q', 'puzzle')
    assert.equal(await page.locator('[data-app]').count(), 1)
    await page.fill('#q', 'zzzz')
    await page.getByText('Nothing matches').waitFor()
    await page.fill('#q', '')
  })
  await step(`${tag}: Library shows AlongSide SetLists and their words`, async () => {
    await page.goto(url + '#library'); await page.locator('[data-list]').waitFor()
    await page.click(`[data-list="${LIST}"]`)
    await page.locator('table.words').waitFor()
    assert.match(await page.locator('table.words').innerText(), /一般[\s\S]*ordinary[\s\S]*一半[\s\S]*half/)
    await noOverflow(page); await shot(page, `${tag}-library`)
  })
  await step(`${tag}: Downloads offers the 19 publicly verified files`, async () => {
    await page.goto(url + '#downloads'); await page.locator('[data-slot]').first().waitFor()
    assert.equal(await page.locator('[data-slot]').count(), 25, 'the reserved figures slot is hidden from Downloads')
    assert.equal(await page.locator('[data-slot] a[download]').count(), 19)
    assert.equal(await page.locator('[data-slot="dualsubs/extension"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/dual-subs/chrome-edge/0.16.117/dual-subs-v0.16.117.zip?v=d3d2e5b19c54')
    assert.equal(await page.locator('[data-slot="polyflow/windows"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/polyflow/windows/0.1.0/PolyFlow-Setup-0.1.0.exe')
    assert.equal(await page.locator('[data-slot="mahjong-tones/test-build"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/mahjong-tones/windows/0.2.0/LiANN-Mahjong-Tones-Windows-0.2.0.zip')
    assert.equal(await page.locator('[data-slot="alongside/android-test"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/alongside-dashboard/android/0.1.3/AlongSide-Dashboard-0.1.3-debug.apk')
    assert.equal(await page.locator('[data-slot="alongside/windows"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/alongside-dashboard/windows/0.1.0/AlongSide-Dashboard-Setup-0.1.0.exe')
    assert.equal(await page.locator('[data-slot="kids/stickers/bella"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/kids/stickers/2026-10-14/bella-sticker-1440px-upscaled-full.png?v=5ffdac')
    assert.doesNotMatch(await page.locator('main').innerText(), /signing|redistribution/i)
    await noOverflow(page); await shot(page, `${tag}-downloads`)
    if (tag === 'phone') {
      await page.locator('[data-slot="kids/stickers/kinetic-shield-specular"]').scrollIntoViewIfNeeded()
      await shot(page, 'phone-downloads-last')
    }
  })
  await step(`${tag}: a reader link (#read/ep1) opens the comic, and closing it leaves #read`, async () => {
    await page.goto(url + '#read/ep1'); await page.locator('.reader').waitFor()
    assert.equal(await page.locator('.rtitle').innerText(), 'Episode 1: Flight')
    await page.locator('#rclose').click(); assert.equal(await page.locator('.reader').count(), 0)
    assert.equal(new URL(page.url()).hash, '#read')
    await page.goto(url + '#read/nope'); await page.locator('[data-readep="ep1"]').waitFor(); assert.equal(await page.locator('.reader').count(), 0, 'an unknown episode just shows the list')
  })
  await step(`${tag}: comic reader: spreads, page turn, arrows, magnifier, place remembered`, async () => {
   try {
    const wide = tag === 'desktop', count = () => page.locator('.rcount').innerText()
    await page.goto(url + '#read'); await page.locator('[data-readep="ep1"]').click()
    await page.locator('.reader').waitFor()
    assert.equal(await page.locator(wide ? '.rbook.spread' : '.rbook.single').count(), 1, wide ? 'wide screens open as a two-page book' : 'phones open one page')
    assert.equal(await count(), '1 / 3'); assert.equal(await page.locator('#rprev').isDisabled(), true)
    assert.equal(await page.locator('#rctl, .rctl').locator('#rprev, #rnext').count(), 2, 'arrows sit together at the bottom centre')
    const [b0, f0] = await Promise.all([page.locator('#rprev').boundingBox(), page.locator('#rnext').boundingBox()])
    const stageBox = await page.locator('#rstage').boundingBox()
    assert.ok(b0.x < f0.x && b0.y > stageBox.y + stageBox.height - 4, 'Back arrow is left of Forward and both are below the page')
    assert.ok(Math.abs((b0.x + f0.x + f0.width) / 2 - page.viewportSize().width / 2) < 40, 'arrows are centred')
    await noOverflow(page); await shot(page, `${tag}-reader`)
    if (wide) {
      await page.waitForTimeout(400)
      const cv = await page.locator('.rbook.shut .pg.r img').boundingBox(), sbx = await page.locator('#rstage').boundingBox()
      const iw = await page.locator('.rbook').evaluate(el => parseFloat(el.style.getPropertyValue('--iw'))) // the page is drawn against the spine, so its width is what the picture really takes
      assert.ok(iw > 100 && Math.abs(cv.x + iw / 2 - (sbx.x + sbx.width / 2)) < 8, 'the closed book sits in the middle of the stage')
      await page.locator('.rbook.shut .pg.r').click() // clicking the cover opens the book: it slides right, then the page turns
      await page.waitForFunction(() => !document.querySelector('.rbook.shut'), null, { timeout: 1000 })
      await page.locator('.flip.fwd').waitFor({ timeout: 2000 })
    } else await page.keyboard.press('ArrowRight')
    assert.equal(await page.locator(wide ? '.flip.fwd' : '.flip.sfwd').count(), 1, 'the page turns')
    assert.equal(await count(), wide ? '2–3 / 3' : '2 / 3')
    await page.locator('.flip').waitFor({ state: 'detached', timeout: 4000 })
    if (wide) {
      assert.equal(await page.locator('#rnext').isDisabled(), true, 'the last spread is the end')
      const box = await page.locator('.pg.r img').boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.locator('#rlens:not([hidden])').waitFor()
      assert.match(await page.locator('#rlens').evaluate(el => el.style.backgroundImage), /downloads\.lwliann\.com\/comics\//)
      await shot(page, `${tag}-reader-lens`)
      await page.mouse.move(box.x + box.width / 2, 20)
      await page.locator('#rlens[hidden]').waitFor({ state: 'attached' })
      await page.keyboard.press('ArrowLeft'); assert.equal(await page.locator('.flip.back').count(), 1); assert.equal(await count(), '1 / 3')
      await page.locator('.flip').waitFor({ state: 'detached', timeout: 4000 })
      assert.equal(await page.locator('.rbook.shut.r').count(), 1, 'back on the cover the book closes: it slides back to the middle')
      await page.locator('#rnext').click(); await page.locator('.flip.fwd').waitFor({ timeout: 2000 }); assert.equal(await count(), '2–3 / 3')
      await page.locator('.flip').waitFor({ state: 'detached', timeout: 4000 })
      await page.locator('#rmode').click(); assert.equal(await page.locator('.rbook.single').count(), 1); assert.equal(await count(), '2 / 3')
    } else {
      await page.locator('#rnext').click(); assert.equal(await count(), '3 / 3'); assert.equal(await page.locator('#rnext').isDisabled(), true)
      await page.keyboard.press('ArrowLeft'); assert.equal(await count(), '2 / 3')
    }
    await page.locator('.flip').waitFor({ state: 'detached', timeout: 4000 })
    await page.locator('#rfull').click(); assert.equal(await page.locator('.reader.full').count(), 1, 'full page hides the top bar')
    assert.equal(await page.locator('.rbar').isVisible(), false); await page.locator('#rexit').click()
    assert.equal(await page.locator('.reader.full').count(), 0); assert.equal(await page.locator('.rbar').isVisible(), true)
    await page.locator('#rzoom').click(); assert.equal(await page.locator('.rstage.zoom').count(), 1)
    await page.locator('#rzoom').click(); assert.equal(await page.locator('.rstage.zoom').count(), 0, 'Fit page comes back to the whole page')
    // mouse wheel and the Up / Down arrow keys zoom the pages in and out
    const zoomOf = () => page.locator('#rstage').evaluate(el => Number(el.style.getPropertyValue('--z')))
    const sb = await page.locator('#rstage').boundingBox(); await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2)
    await page.mouse.wheel(0, -300); assert.ok(await zoomOf() > 1, 'wheel up zooms in'); assert.equal(await page.locator('.rstage.zoom').count(), 1)
    const z1 = await zoomOf(); await page.keyboard.press('ArrowUp'); assert.ok(await zoomOf() > z1, 'Up arrow zooms in')
    for (let k = 0; k < 12; k++) await page.keyboard.press('ArrowUp'); assert.ok(await zoomOf() <= 4 + 1e-9, 'zoom stops at 4x')
    await page.mouse.wheel(0, 3000); await page.keyboard.press('ArrowDown'); assert.equal(await zoomOf(), 1, 'wheel down and Down arrow zoom back out to the whole page')
    assert.equal(await page.locator('.rstage.zoom').count(), 0); assert.equal(await page.locator('#rzoom').innerText(), 'Zoom')
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.reader').count(), 0)
    assert.match(await page.locator('[data-readep="ep1"]').innerText(), /Continue from page 2/)
    await page.locator('[data-readep="ep1"]').click(); assert.equal(await count(), '2 / 3')
    if (!wide) { await page.locator('#rmode').click(); assert.equal(await page.locator('.rbook.spread').count(), 1); assert.equal(await count(), '2–3 / 3') }
    await page.locator('#rclose').click(); assert.equal(await page.locator('.reader').count(), 0)
   } catch (e) { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/FAIL-${tag}-reader.png` }); throw e }
   finally { if (await page.locator('.reader').count()) await page.keyboard.press('Escape') }
  })
  await step(`${tag}: 3D book: bending page turn, page stack, draggable magnifier (when WebGL exists)`, async () => {
    try {
      await page.goto(url + '#read'); await page.locator('[data-readep="ep1"]').click(); await page.locator('.reader').waitFor()
      const hasGL = await page.locator('#r3d').count()
      assert.equal(hasGL, await page.evaluate(() => { try { const c = document.createElement('canvas'); return c.getContext('webgl2') || c.getContext('webgl') ? 1 : 0 } catch { return 0 } }), 'the 3D book is offered exactly when WebGL exists')
      if (!hasGL) return
      await page.locator('#r3d').click()
      await page.locator('.book3d canvas').waitFor({ timeout: 15000 })
      const size = await page.locator('.book3d canvas').boundingBox(); assert.ok(size.width > 200 && size.height > 200, 'the canvas fills the stage')
      assert.equal(await page.locator('#rzoom').count(), 0, 'Zoom is replaced by the magnifier in 3D')
      await page.waitForTimeout(600); await shot(page, `${tag}-book3d-cover`)
      await page.keyboard.press('ArrowRight'); await page.waitForTimeout(430); await shot(page, `${tag}-book3d-turn`)
      assert.equal(await page.locator('.rcount').innerText(), '2–3 / 3'); await page.waitForTimeout(1300)
      assert.equal(await page.locator('#rnext').isDisabled(), true)
      await page.waitForTimeout(300); await shot(page, `${tag}-book3d-open`)
      // the brass magnifier: drag it onto the right-hand page and the glass shows that page enlarged
      const brass = page.locator('.brass'); await brass.waitFor()
      const bb = await brass.boundingBox(), st = await page.locator('.book3d').boundingBox()
      await page.mouse.move(bb.x + 100, bb.y + 100); await page.mouse.down(); await page.mouse.move(st.x + st.width * 0.62, st.y + st.height * 0.45, { steps: 8 }); await page.mouse.up()
      await page.waitForTimeout(200)
      assert.match(await page.locator('.brass .bglass').evaluate(el => el.style.backgroundImage), /downloads\.lwliann\.com\/comics\/ep1\/page-/, 'the glass shows the page under it')
      await shot(page, `${tag}-book3d-lens`)
      await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(1500); assert.equal(await page.locator('.rcount').innerText(), '1 / 3')
      await page.mouse.move(st.x + st.width / 2, st.y + st.height / 2); await page.mouse.wheel(0, -400)
      assert.equal(await page.locator('.book3d.zoomed').count(), 1, 'the wheel zooms the 3D book'); await page.keyboard.press('ArrowDown'); await page.mouse.wheel(0, 3000)
      assert.equal(await page.locator('.book3d.zoomed').count(), 0, 'and zooms back out to the whole book')
      await page.locator('#r3d').click(); assert.equal(await page.locator('.book3d').count(), 0, 'Flat pages brings back the flat reader')
    } finally {
      if (process.env.SHOTS && await page.locator('.reader').count()) await page.screenshot({ path: `${process.env.SHOTS}/${tag}-book3d-state.png` })
      if (await page.locator('#r3d[aria-pressed="true"]').count()) await page.locator('#r3d').click()
      if (await page.locator('.reader').count()) await page.keyboard.press('Escape')
    }
  })
  await step(`${tag}: 3D book: the brass magnifier reaches the whole left-hand page on a later spread`, async () => {
    try {
      await page.goto(url + '#read'); await page.locator('[data-readep="ep2"]').click(); await page.locator('.reader').waitFor()
      if (!await page.locator('#r3d').count()) return
      await page.locator('#r3d').click(); await page.locator('.book3d canvas').waitFor({ timeout: 15000 }); await page.waitForTimeout(600)
      await page.waitForTimeout(3000)
      const st = await page.locator('.book3d canvas').boundingBox()
      const glassOn = async fx => {
        const b = await page.locator('.brass').boundingBox()
        await page.mouse.move(b.x + 100, b.y + 100); await page.mouse.down(); await page.mouse.move(st.x + st.width * fx, st.y + st.height * 0.45, { steps: 6 }); await page.mouse.up()
        await page.waitForTimeout(200)
        return /^url/.test(await page.locator('.brass .bglass').evaluate(el => el.style.backgroundImage))
      }
      await page.keyboard.press('ArrowRight'); await page.waitForTimeout(4200)
      await page.keyboard.press('ArrowRight'); await page.waitForTimeout(4200)
      assert.equal(await page.locator('.rcount').innerText(), '4–5 / 6')
      // the book is centred, so the left page mirrors the right one: find where the right page ends, then check the left page reaches its mirror
      let right = 0.55; while (right < 0.99 && await glassOn(right + 0.01)) right += 0.01
      let left = 0.5; while (left > 0.01 && await glassOn(left - 0.01)) left -= 0.01
      assert.ok(left < 1 - right + 0.05, `the left page magnifies out to its edge (reaches ${left.toFixed(2)}, right page ends ${right.toFixed(2)})`)
    } finally {
      if (await page.locator('#r3d[aria-pressed="true"]').count()) await page.locator('#r3d').click()
      if (await page.locator('.reader').count()) await page.keyboard.press('Escape')
    }
  })
  await step(`${tag}: protected comic pages: signed links, no image menu, a watermark with the reader's address`, async () => {
    try {
      seen.signs.length = 0
      await page.goto(url + '#read'); await page.locator('[data-readep="ep3"]').click(); await page.locator('.reader').waitFor()
      await page.waitForFunction(() => document.querySelectorAll('.reader .pg img').length > 0)
      assert.equal(seen.signs.length, 1, 'one request for signed links')
      assert.equal(seen.signs[0].auth, 'Bearer at', 'sent with the signed-in token')
      assert.deepEqual(seen.signs[0].paths, ['/comic/ep-03/p1.webp', '/comic/ep-03/p2.webp', '/comic/ep-03/p3.webp'])
      const src = await page.locator('.reader .pg img').first().getAttribute('src')
      assert.match(src, /\/comic\/ep-03\/p1\.webp\?e=1&u=abcdef012345&s=a{40}$/, 'the page is a signed link')
      assert.equal(await page.locator('.reader .pg img').first().evaluate(el => getComputedStyle(el).pointerEvents), 'none', 'the image takes no clicks, so it offers no image menu')
      assert.equal(await page.locator('.reader').evaluate(el => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented }), true, 'right-click / long-press menu is off')
      assert.equal(await page.locator('.reader').evaluate(el => getComputedStyle(el).userSelect), 'none')
      const mark = await page.locator('.reader .wm').evaluate(el => ({ bg: decodeURIComponent(getComputedStyle(el).backgroundImage), pe: getComputedStyle(el).pointerEvents, pos: getComputedStyle(el).position }))
      assert.ok(mark.bg.includes('ann.mingen@example.com'), 'the watermark carries the signed-in address')
      assert.equal(mark.pe, 'none'); assert.equal(mark.pos, 'fixed')
    } finally { if (await page.locator('.reader').count()) await page.keyboard.press('Escape') }
  })
  await step(`${tag}: Read and Kids pages render their manifest slots`, async () => {
    await page.goto(url + '#read'); await page.locator('[data-slot="read/episodes"]').waitFor()
    assert.equal(await page.locator('[data-slot="read/episodes"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/bella-liann/issue-1/Bella_LiANN_Issue_One_BW.pdf?v=c38c05b16322')
    assert.equal(await page.locator('main a[download]').count(), 1, 'the Issue One PDF is the only download on the Read page')
    await shot(page, `${tag}-read`)
    await page.goto(url + '#kids'); await page.locator('[data-slot="kids/colouring/flight"]').waitFor()
    assert.match(await page.locator('main').innerText(), /Colour the characters[\s\S]*Colour by tone[\s\S]*Specular sticker sheets[\s\S]*Kinetic Shield sticker pack/)
    assert.equal(await page.locator('main a[download]').count(), 13)
    assert.equal(await page.locator('[data-slot="kids/colouring/characters"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/kids/colouring/1.1.0/BellaLiANN-Colour-the-Characters-1.1.0-A4.pdf?v=fbd7b2172238')
    assert.equal(await page.locator('[data-slot="kids/colouring/by-tone"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/kids/colouring/1.2.0/BellaLiANN-Colour-by-Tone-1.2.0-A4.pdf?v=a0f093fc20d6')
    assert.equal(await page.locator('[data-slot="kids/stickers/specular"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/kids/stickers/issue1-2026-10-14/Bella_LiANN_Issue1_Specular_Sticker_Sheets_A4.pdf?v=a04c96464c4f')
    assert.equal(await page.locator('[data-slot="kids/stickers/kinetic-shield"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/kids/stickers/issue1-2026-10-14/Bella_LiANN_Kinetic_Shield_BW_and_Specular_Sticker_Pack_A4.pdf?v=b2fce50e4943')
    await noOverflow(page); await shot(page, `${tag}-kids`)
    if (tag === 'phone') {
      await page.locator('[data-slot="kids/stickers/specular"]').scrollIntoViewIfNeeded()
      await shot(page, 'phone-kids-stickers')
      await page.locator('[data-slot="kids/stickers/kinetic-shield-specular"]').scrollIntoViewIfNeeded()
      await shot(page, 'phone-kids-artwork')
    }
  })
  await step(`${tag}: the menu matches the approved design and every page renders`, async () => {
    if (tag === 'desktop') assert.deepEqual(await page.locator('nav.rail .lbl').allInnerTexts(), ['Home', 'Apps', 'Library', 'Read', 'Figures', 'Discover', 'Kids', 'Shop', 'Downloads', 'Plan'])
    else {
      assert.deepEqual(await page.locator('nav.tabs .lbl').allInnerTexts(), ['Home', 'Apps', 'Library', 'Downloads', 'More'])
      await page.click('#morebtn'); assert.deepEqual(await page.locator('nav.moresheet .lbl').allInnerTexts(), ['Read', 'Figures', 'Discover', 'Kids', 'Shop', 'Plan'])
      await shot(page, 'phone-more')
      await page.click('nav.moresheet [data-nav="shop"]'); await page.locator('[data-shopf]').first().waitFor(); assert.equal(await page.locator('nav.moresheet').count(), 0)
    }
    for (const [hash, text] of [['discover', /Try something new/], ['shop', /Price to be set/], ['plan', /Plans[\s\S]*Couple[\s\S]*Family/], ['apps', /Coming video game/]]) {
      await page.goto(url + '#' + hash); await page.locator('main .sec').first().waitFor()
      assert.match(await page.locator('main').innerText(), text, hash)
      await noOverflow(page); await shot(page, `${tag}-${hash}`)
    }
    await page.goto(url + '#shop'); assert.equal(await page.locator('main .acts button:not([disabled])').count(), 0, 'nothing in the shop can be bought yet')
    await page.click('[data-shopf="Figures"]'); assert.equal(await page.locator('main .grid > .c').count(), 2)
    await page.goto(url + '#plan'); await page.click('[data-planf="Organisations"]'); assert.match(await page.locator('main').innerText(), /Education Department/)
  })
  await step(`${tag}: appearance changes and is remembered`, async () => {
    await page.goto(url + '#plan'); await page.locator('#apbtn2').click()
    await page.click('.dsopt[data-ds="steelline"]'); await page.click('[data-mode="light"]')
    await page.reload(); await page.locator('.hello, .sec').first().waitFor()
    assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.ds, document.documentElement.dataset.t]), ['steelline', 'light'])
  })
  await step(`${tag}: the bell opens a notification menu`, async () => {
    await page.goto(url + '#home'); await page.locator('#bell').click()
    await page.locator('#notifpanel').waitFor()
    assert.match(await page.locator('#notifpanel').innerText(), /Notifications[\s\S]*caught up/)
    await noOverflow(page); await shot(page, `${tag}-notifications`)
    await page.locator('#notifclose').click()
    assert.equal(await page.locator('#notifpanel').count(), 0)
  })
  await step(`${tag}: sign out clears the session`, async () => {
    await page.goto(url + '#plan'); await page.locator('#signout').click()
    await page.locator('#f1').waitFor()
    assert.equal(await page.evaluate(() => localStorage.getItem('liann-hub-session-v1')), null)
    await page.reload(); await page.locator('#f1').waitFor()
  })
  await step(`${tag}: no console errors`, async () => assert.deepEqual(errors, [], JSON.stringify(errors)))
  await context.close()
}

{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await mock(context, { tour: true })
  await context.addInitScript(() => localStorage.setItem('liann-hub-session-v1', JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: 9999999999 })))
  const page = await context.newPage()
  await step('Figures page draws the 3D view from the hub’s own three.js (or says plainly when WebGL is missing)', async () => {
    await page.goto(url + '#figures'); await page.locator('#fig3d').waitFor()
    await page.locator('#fig3d canvas, #fig3d .load:has-text("can’t show")').first().waitFor()
    await page.click('[data-figmode="lineup"]'); await page.locator('#fig3d .ph', { hasText: 'Early models' }).waitFor()
  })
  await step('first-visit tour shows once and can be skipped', async () => {
    await page.goto(url + '#home')
    await page.locator('.tour').waitFor(); assert.match(await page.locator('.tour').innerText(), /1 of 4/)
    await page.click('#tnext'); assert.match(await page.locator('.tour').innerText(), /2 of 4/)
    await page.click('#tskip'); assert.equal(await page.locator('.tour').count(), 0)
    await page.reload(); await page.locator('.hello').waitFor(); assert.equal(await page.locator('.tour').count(), 0)
  })
  await context.close()
}

{
  // the page host sends no CORS headers: the flat reader must still show the pages, and the 3D option must not be offered
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await mock(context, { tour: false })
  await context.addInitScript(() => localStorage.setItem('liann-hub-session-v1', JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: 9999999999 })))
  // a host without CORS: plain image requests work, CORS-mode requests (they carry an Origin header) fail
  await context.route(/downloads\.lwliann\.com\/comics\/ep1\/page-(\d)\.jpg/, r => r.request().headers().origin ? r.abort() : r.fulfill({ path: fileURLToPath(new URL(`./fixtures/page-${r.request().url().match(/page-(\d)/)[1]}.jpg`, import.meta.url)), contentType: 'image/jpeg' }))
  const page = await context.newPage()
  await step('comic reader without CORS headers: flat pages still load and the 3D book is not offered', async () => {
    await page.goto(url + '#read'); await page.locator('[data-readep="ep1"]').click(); await page.locator('.reader').waitFor()
    await page.waitForFunction(() => { const im = document.querySelector('.reader .pg img'); return im && im.complete && im.naturalWidth > 0 }, null, { timeout: 8000 })
    assert.equal(await page.locator('#r3d').count(), 0)
    assert.equal(await page.locator('.rbook').count(), 1)
  })
  await context.close()
}

{
  const context = await browser.newContext()
  await context.addInitScript(() => localStorage.setItem('liann-hub-session-v1', JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: 9999999999 })))
  const page = await context.newPage()
  const seen = await mock(context, { student: false })
  await context.route('https://lwl-backend-mhgo.onrender.com/auth/liann/continue', r => r.fulfill({ contentType: 'text/html', body: '<title>AlongSide</title>' }))
  await step('returning user without a learner profile is asked to finish it, and AlongSide opens signed in', async () => {
    await page.goto(url + '#library')
    await page.getByRole('heading', { name: 'Finish your learner profile' }).waitFor()
    const [tab] = await Promise.all([context.waitForEvent('page'), page.click('#finishprofile')])
    await tab.waitForURL(/\/auth\/liann\/continue#pass=test-pass$/)
    assert.deepEqual(seen.pass, { next: '/student#profile' })
    await page.locator('#retrylib').waitFor()
  })
  await context.close()
}

{
  // One LiANN account C3: a Family household with a child profile (AlongSide has households switched on).
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => localStorage.setItem('liann-hub-session-v1', JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: 9999999999 })))
  await mock(context)
  const CHILD = '99999999-8888-4777-8666-555555555555', posts = []
  const state = { household: { id: 'h1', plan: 'family', role: 'owner', limits: { adults: 2, children: 4 } },
    members: [{ email: 'ann.mingen@example.com', role: 'owner', me: true, accountId: 'acc-1' }],
    children: [{ id: CHILD, name: 'Mei' }], invites: [], invitations: [] }
  await context.route('https://lwl-backend-mhgo.onrender.com/learning/household**', async r => {
    const u = new URL(r.request().url()), m = r.request().method()
    assert.equal(r.request().headers().authorization, 'Bearer at')
    if (u.pathname === '/learning/household/policies') return r.fulfill({ json: { policies: [{ slug: 'terms', title: 'Terms', version: 2, body_text: 'Terms text' }, { slug: 'privacy', title: 'Privacy Promise', version: 1, body_text: 'Privacy text' }] } })
    if (u.pathname === '/learning/household' && m === 'GET') return r.fulfill({ json: state })
    if (u.pathname === '/learning/household/children' && m === 'POST') {
      const body = r.request().postDataJSON(); posts.push(body)
      state.children = [...state.children, { id: '77777777-6666-4555-8444-333333333333', name: body.name }]
      return r.fulfill({ status: 201, json: { child: { id: 'x', name: body.name } } })
    }
    return r.fulfill({ status: 404, json: {} })
  })
  let profileQuery = null
  await context.route('https://lwl-backend-mhgo.onrender.com/learning/setlists?profileId=*', r => {
    profileQuery = new URL(r.request().url()).searchParams.get('profileId')
    return r.fulfill({ json: { ok: true, setlists: [{ id: LIST, name: 'Mei tones', words: 1, source_product: 'liann-mahjong-tones' }] } })
  })
  const page = await context.newPage()
  await step('Family: "Who\'s learning?" lists the child and opens their own Library', async () => {
    await page.goto(url)
    await page.locator('#me').first().click()
    await page.locator(`[data-pickchild="${CHILD}"]`).click()
    await page.getByText('Mei\u2019s SetLists from every game').waitFor()
    await page.getByText('Mei tones').waitFor()
    assert.equal(profileQuery, CHILD)
  })
  await step('Family: the Plan page adds a child with guardian consent', async () => {
    await page.goto(url + '#plan'); await page.reload()
    await page.getByRole('heading', { name: 'Household' }).waitFor()
    await page.getByText('Terms (version 2)').waitFor()
    await page.fill('#hhcname', 'Lin'); await page.fill('#hhcdob', '2019-03-04'); await page.fill('#hhgname', 'Ann Mingen')
    await page.check('#hhagree'); await page.click('#hhchild [type=submit]')
    await page.locator('li', { hasText: /^Lin · child profile/ }).waitFor()
    assert.deepEqual(posts[0], { name: 'Lin', dateOfBirth: '2019-03-04', guardianName: 'Ann Mingen', agreements: { terms: true, privacy: true } })
  })
  await shot(page, 'household-plan')
  await context.close()
}

// A shared comic link opens for anyone: no sign-in, no account, the same protections.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  const seen = await mock(context)
  const page = await context.newPage()
  await step('shared comic link (#read/<episode>) opens without signing in', async () => {
    await page.goto(url + '#read/ep3')
    await page.locator('.reader').waitFor()
    await page.waitForFunction(() => document.querySelectorAll('.reader .pg img').length > 0)
    assert.equal(await page.locator('#f1').count(), 0, 'no sign-in form in the way')
    assert.equal(seen.signs.length, 1)
    assert.equal(seen.signs[0].auth, undefined, 'asked for links without an account')
    assert.match(await page.locator('.reader .pg img').first().getAttribute('src'), /\/comic\/ep-03\/p1\.webp\?e=1&u=abcdef012345&s=a{40}$/)
    const mark = decodeURIComponent(await page.locator('.reader .wm').evaluate(el => getComputedStyle(el).backgroundImage))
    assert.match(mark, /Learning with LiANN · [0-9A-F]{8}/, 'a visitor gets a viewing code in the watermark')
    assert.equal(await page.locator('.reader').evaluate(el => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented }), true)
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(500)
    assert.match(await page.locator('.rcount').innerText(), /^2/)
  })
  await step('closing a shared comic leads to the hub sign-in; other links still ask for sign-in', async () => {
    await page.keyboard.press('Escape')
    await page.locator('#f1').waitFor()
    await page.goto(url + '#library'); await page.reload()
    await page.locator('#f1').waitFor()
    assert.equal(await page.locator('.reader').count(), 0)
  })
  await context.close()
}

await browser.close(); server.close()
if (failures) { console.log(`${failures} smoke step(s) failed`); process.exit(1) }
console.log('Smoke test passed')
