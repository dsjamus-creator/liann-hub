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
const ACCOUNT_FREE = { email: 'ann.mingen@example.com', registered: true, accountType: 'registered',
  plans: { household: null, teacher: false, organisation: false, staff: false },
  capabilities: { authorboard: false, polyflowStudio: true, saveAssets: true, saveCurricula: true, saveSetlists: true, saveCuratedWords: true, runHousehold: false, teachStudents: false, runOrganisation: false, shareSetlists: false } }
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
  await context.route('**/comic/logout', r => r.fulfill({ status: 204, body: '' }))
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
  // The support form and live chat (lwl-backend /support/...): staff online or not, enquiries and chat messages recorded.
  seen.support = { online: false, enquiries: [], chat: null, messages: [] }
  await context.route('https://lwl-backend-mhgo.onrender.com/support/**', r => {
    const req = r.request(), url = new URL(req.url()), p = url.pathname, S = seen.support
    if (p === '/support/chat/status') return r.fulfill({ json: { staffOnline: S.online } })
    if (p === '/support/enquiries') { S.enquiries.push(req.postDataJSON()); return r.fulfill({ status: 201, json: { ok: true, reference: 'SUP-TEST23' } }) }
    if (p === '/support/chat' && req.method() === 'POST') {
      if (!S.online) return r.fulfill({ status: 409, json: { error: 'no_staff_online' } })
      S.chat = req.postDataJSON(); S.messages = [{ id: 1, from: 'you', body: S.chat.message, at: 'now' }]
      return r.fulfill({ status: 201, json: { ok: true, chatId: '11111111-1111-4111-8111-111111111111', token: 't'.repeat(43), staffOnline: true } })
    }
    if (/\/messages$/.test(p)) { const m = { id: S.messages.length + 1, from: 'you', body: req.postDataJSON().body, at: 'now' }; S.messages.push(m); return r.fulfill({ status: 201, json: { message: m } }) }
    if (/^\/support\/chat\/[0-9a-f-]{36}$/.test(p)) {
      assert.equal(req.headers()['x-chat-token'], 't'.repeat(43), 'the chat token travels as a header')
      const after = Number(url.searchParams.get('after'))
      return r.fulfill({ json: { status: S.messages.some(m => m.from === 'support') ? 'active' : 'waiting', staffOnline: S.online, messages: S.messages.filter(m => m.id > after), offerDetails: false, reference: null } })
    }
    return r.fulfill({ status: 404, json: { error: 'chat_not_found' } })
  })
  await context.route('https://lwl-backend-mhgo.onrender.com/learning/**', r => {
    assert.equal(r.request().headers().authorization, 'Bearer at')
    const p = new URL(r.request().url()).pathname
    // A registered account on the free tier: nothing to share with, no plan held. (Neither route needs a learner profile.)
    if (p === '/learning/account') return r.fulfill({ json: ACCOUNT_FREE })
    if (p === '/learning/setlists/shares') return r.fulfill({ json: { ok: true, incoming: [], outgoing: [] } })
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
    assert.equal(await page.locator('[data-app="tiles"] a[data-open]').first().getAttribute('href'), 'https://playtest.lwliann.com/playtest/game/')
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
  await step(`${tag}: Downloads withholds private tester builds`, async () => {
    await page.goto(url + '#downloads'); await page.locator('[data-slot]').first().waitFor()
    assert.equal(await page.locator('[data-slot]').count(), 25, 'the reserved figures and comic slots are hidden from Downloads')
    assert.equal(await page.locator('[data-slot] a[download]').count(), 17, 'PolyFlow 0.1.1 for Windows and Android are public (lwl-backend docs/LIANN-DOWNLOADS.md)')
    assert.equal(await page.locator('[data-slot="lyricsync/extension"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/lyricsync/chrome-edge/0.9.31/LyricSync-v0.9.31-hub-public-20261021.zip?v=9860fee62532')
    assert.equal(await page.locator('[data-slot="dualsubs/extension"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/dual-subs/chrome-edge/0.16.120/dual-subs-v0.16.120-free-hub-public-20261021.zip?v=3dbaeb17ccb1')
    for (const slot of ['mahjong-tones/test-build', 'alongside/android-test', 'alongside/windows']) assert.equal(await page.locator(`[data-slot="${slot}"] a[download]`).count(), 0)
    assert.match(await page.locator('[data-slot="polyflow/windows"] a[download]').getAttribute('href'), /PolyFlow-Setup-0\.1\.1\.exe$/)
    assert.equal(await page.locator('[data-slot="kids/stickers/bella"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/kids/stickers/2026-10-14/bella-sticker-1440px-upscaled-full.png?v=5ffdac')
    assert.doesNotMatch(await page.locator('main').innerText(), /signing|redistribution/i)
    await noOverflow(page); await shot(page, `${tag}-downloads`)
    if (tag === 'phone') {
      await page.locator('[data-slot="kids/stickers/kinetic-shield-bw"]').scrollIntoViewIfNeeded()
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
    await page.goto(url + '#read'); await page.locator('[data-readep="ep1"]').waitFor()
    assert.equal(await page.locator('main a[download]').count(), 0, 'the Issue One PDF is not offered')
    await shot(page, `${tag}-read`)
    await page.goto(url + '#kids'); await page.locator('[data-slot="kids/colouring/characters"]').waitFor()
    assert.match(await page.locator('main').innerText(), /Colour the characters[\s\S]*Colour by tone[\s\S]*Adventure Ribbon & Kinetic Shield specular sticker pack/)
    assert.equal(await page.locator('main a[download]').count(), 6)
    assert.equal(await page.locator('[data-slot="kids/stickers/bella-print"], [data-slot="kids/stickers/bella"], [data-slot="kids/stickers/kinetic-shield"], [data-slot="kids/stickers/kinetic-shield-colour"], [data-slot="kids/stickers/adventure-ribbon-specular"], [data-slot="kids/stickers/adventure-ribbon-colour"], [data-slot="kids/stickers/kinetic-shield-specular"]').count(), 0, 'removed cards stay removed')
    assert.deepEqual(await page.locator('main [data-slot^="kids/stickers/"]').evaluateAll(els => els.map(e => e.dataset.slot)), ['kids/stickers/specular', 'kids/stickers/adventure-ribbon-bw', 'kids/stickers/kinetic-shield-bw'])
    assert.equal(await page.locator('main button[disabled]').count(), 0, 'no Kids card is an empty "Coming soon"')
    assert.equal(await page.locator('[data-slot="kids/colouring/flight"]').count(), 0, 'the unreleased Flight book has no card')
    assert.equal(await page.locator('[data-slot="kids/colouring/characters"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/kids/colouring/1.1.0/BellaLiANN-Colour-the-Characters-1.1.0-A4.pdf?v=fbd7b2172238')
    assert.equal(await page.locator('[data-slot="kids/colouring/by-tone"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/kids/colouring/1.2.0/BellaLiANN-Colour-by-Tone-1.2.0-A4.pdf?v=a0f093fc20d6')
    assert.equal(await page.locator('[data-slot="kids/stickers/specular"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/kids/stickers/issue1-2026-10-14/Bella_LiANN_Issue1_Specular_Sticker_Sheets_A4.pdf?v=a04c96464c4f')
    await noOverflow(page); await shot(page, `${tag}-kids`)
    if (tag === 'phone') {
      await page.locator('[data-slot="kids/stickers/specular"]').scrollIntoViewIfNeeded()
      await shot(page, 'phone-kids-stickers')
      await page.locator('[data-slot="kids/stickers/kinetic-shield-bw"]').scrollIntoViewIfNeeded()
      await shot(page, 'phone-kids-artwork')
    }
  })
  await step(`${tag}: product pages render for visitors, the visitor's platform first`, async () => {
    await page.goto(url + 'polyflow'); await page.locator('.product .hero h1').waitFor()
    assert.match(await page.locator('.product .hero h1').innerText(), /PolyFlow/)
    assert.match(await page.locator('.pmain').innerText(), /Studio[\s\S]*Performance[\s\S]*Light/)
    assert.equal(await page.locator('.prows .prow').first().getAttribute('data-os'), tag === 'phone' ? 'web' : 'web', 'a Linux Chromium visitor is "other": the web row leads')
    assert.match(await page.locator('.prow[data-os="windows"] a[download]').getAttribute('href'), /PolyFlow-Setup-0\.1\.1\.exe$/, 'the Windows file comes from the manifest')
    assert.match(await page.locator('.prow[data-os="android"] a[download]').getAttribute('href'), /PolyFlow-Android-0\.1\.1\.apk$/)
    assert.equal(await page.locator('.prow[data-os="android"] button[disabled]').innerText(), 'Coming to Google Play')
    await noOverflow(page); await shot(page, `${tag}-product-polyflow`)
    for (const slug of ['pinyin-tiles', 'pinyin-puzzle', 'mahjong-tones', 'alongside', 'dual-subs', 'lyricsync']) {
      await page.goto(url + slug); await page.locator('.product .hero h1').waitFor(); await noOverflow(page)
    }
    await shot(page, `${tag}-product-alongside`)
    await page.goto(url + '#apps'); await page.locator('[data-app="poly"] [data-page="polyflow"]').waitFor()
    assert.equal(await page.locator('[data-app="poly"] [data-page="polyflow"]').getAttribute('href'), '/polyflow')
  })
  await step(`${tag}: the menu matches the approved design and every page renders`, async () => {
    if (tag === 'desktop') assert.deepEqual(await page.locator('nav.rail .lbl').allInnerTexts(), ['Home', 'Apps', 'Library', 'Read', 'Figures', 'Discover', 'Kids', 'Shop', 'Downloads', 'Plan', 'Help'])
    else {
      assert.deepEqual(await page.locator('nav.tabs .lbl').allInnerTexts(), ['Home', 'Apps', 'Library', 'Downloads', 'More'])
      await page.click('#morebtn'); assert.deepEqual(await page.locator('nav.moresheet .lbl').allInnerTexts(), ['Read', 'Figures', 'Discover', 'Kids', 'Shop', 'Plan', 'Help'])
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
  await step(`${tag}: Help shows the FAQ, the support form sends a message, and live chat works while staff are online`, async () => {
    seen.support.online = false
    await page.goto(url + '#help'); await page.locator('details.faq').first().waitFor()
    assert.equal(await page.locator('details.faq').count(), 7)
    await page.locator('details.faq[data-faq="sign-in"] summary').click()
    assert.equal(await page.locator('details.faq[data-faq="sign-in"] li').count(), 3, 'the mini-guide steps show')
    await page.locator('details.faq[data-faq="free"] summary').click()
    assert.match(await page.locator('main').innerText(), /Do I have to pay[\s\S]*Plans are for sharing/)
    await page.locator('.lwls').waitFor(); await page.getByText('Chat is offline: leave a message').waitFor()
    assert.equal(await page.getByRole('button', { name: 'Start live chat' }).isVisible(), false, 'no chat button while nobody is online')
    assert.equal(await page.locator('#lwls-email').inputValue(), 'ann.mingen@example.com', 'the signed-in email is prefilled')
    await page.selectOption('#lwls-topic', 'setlists'); await page.fill('#lwls-message', 'My saved words are missing from the Library.')
    await page.getByRole('button', { name: 'Send message' }).click()
    await page.getByText('SUP-TEST23').waitFor()
    assert.deepEqual([seen.support.enquiries[0].source, seen.support.enquiries[0].product, seen.support.enquiries[0].topic, seen.support.enquiries[0].email], ['hub-support', 'hub', 'setlists', 'ann.mingen@example.com'])
    await noOverflow(page); await shot(page, `${tag}-help`)
    // Staff online: chat is offered, and survives the hub redrawing around it.
    seen.support.online = true
    await page.reload(); await page.getByText('Live chat is available').waitFor()
    await page.fill('#lwls-message', 'Is anyone there?'); await page.getByRole('button', { name: 'Start live chat' }).click()
    await page.getByText('Waiting for someone to join').waitFor()
    seen.support.messages.push({ id: 2, from: 'support', body: 'Hello, how can I help?', at: 'now' })
    await page.locator('.lwls-msg.support').waitFor()
    await page.evaluate(() => { location.hash = '#plan' }); await page.locator('main').getByText('Plans', { exact: true }).first().waitFor()
    await page.evaluate(() => { location.hash = '#help' }); await page.locator('.lwls-msg.support').waitFor()
    assert.equal(await page.locator('.lwls-msg').count(), 2, 'the chat survived a trip to another page, with nothing repeated')
    await page.fill('#lwls-say', 'The Library is empty'); await page.keyboard.press('Enter')
    await page.locator('.lwls-msg.you', { hasText: 'The Library is empty' }).waitFor()
    await noOverflow(page); await shot(page, `${tag}-help-chat`)
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

// Two adults using the same browser must not inherit one another's reading position.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await mock(context)
  let activeEmail = 'first@example.com'
  let releaseComicLogout, signalComicLogout
  let delayFirstLogout = true
  const comicLogoutStarted = new Promise(resolve => { signalComicLogout = resolve })
  await context.route('**/comic/logout', async route => {
    if (delayFirstLogout) {
      signalComicLogout()
      await new Promise(resolve => { releaseComicLogout = resolve })
      delayFirstLogout = false
    }
    await route.fulfill({ status: 204, body: '' })
  })
  await context.route('https://demo.supabase.co/auth/v1/user', r => r.fulfill({ json: { email: activeEmail, email_confirmed_at: '2026-10-12T00:00:00Z' } }))
  await context.addInitScript(() => {
    if (!localStorage.getItem('test-initialized')) {
      localStorage.setItem('liann-hub-session-v1', JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: 9999999999 }))
      localStorage.setItem('liann-hub-reader', JSON.stringify({ ep1: 1 })) // legacy device-wide position must not be assigned to either adult
      localStorage.setItem('test-initialized', 'true')
    }
  })
  const page = await context.newPage()
  const signIn = async email => {
    await page.fill('#em', email); await page.click('#f1 [type=submit]'); await page.locator('#f2').waitFor()
    activeEmail = email
    await page.locator('#c0').evaluate(el => { el.value = '246810'; el.dispatchEvent(new Event('input', { bubbles: true })) })
    await page.locator('#pick').waitFor(); await page.click('#pick')
    await page.locator('#me').waitFor()
  }
  const signOut = async () => {
    await page.goto(url + '#plan'); await page.locator('#signout').click()
    if (delayFirstLogout) {
      await comicLogoutStarted
      try {
        assert.equal(await page.locator('#f1').count(), 0, 'the sign-in gate must wait for comic-cookie revocation')
        assert.match(await page.locator('#root').innerText(), /Loading/)
      } finally { releaseComicLogout() }
    }
    await page.locator('#f1').waitFor()
  }
  await step('reading position is scoped to the signed-in adult account', async () => {
    await page.goto(url + '#read'); await page.locator('[data-readep="ep1"]').waitFor()
    assert.equal(await page.locator('[data-readep="ep1"]').innerText(), 'Read', 'do not assign legacy shared progress to the first account')
    await page.locator('[data-readep="ep1"]').click(); await page.locator('#rnext').click()
    await page.waitForFunction(() => document.querySelector('.rcount')?.textContent.includes('2–3'))
    await page.locator('#rclose').click()
    assert.match(await page.locator('[data-readep="ep1"]').innerText(), /Continue from page 2/)
    await signOut()
    await signIn('second@example.com')
    await page.goto(url + '#read'); await page.locator('[data-readep="ep1"]').waitFor()
    assert.equal(await page.locator('[data-readep="ep1"]').innerText(), 'Read', 'the second account starts at the beginning')
    await page.locator('[data-readep="ep1"]').click()
    assert.equal(await page.locator('.rcount').innerText(), '1 / 3')
    await page.locator('#rclose').click()
    await signOut()
    await signIn('first@example.com')
    await page.goto(url + '#read'); await page.locator('[data-readep="ep1"]').waitFor()
    assert.match(await page.locator('[data-readep="ep1"]').innerText(), /Continue from page 2/, 'the first account keeps its own position')
  })
  await context.close()
}

// A shared comic link needs a LiANN account.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  const seen = await mock(context)
  const page = await context.newPage()
  await step('shared comic link (#read/<episode>) asks for a LiANN account', async () => {
    await page.goto(url + '#read/ep3')
    await page.locator('#f1').waitFor()
    assert.equal(await page.locator('.reader').count(), 0)
    assert.equal(seen.signs.length, 0)
  })
  await step('other hub links still ask for sign-in', async () => {
    await page.goto(url + '#library'); await page.reload()
    await page.locator('#f1').waitFor()
    assert.equal(await page.locator('.reader').count(), 0)
  })
  await context.close()
}

// The sign-in link in the email comes back to the hub with the session in the address (Supabase implicit flow).
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  const seen = await mock(context)
  const page = await context.newPage()
  await step('the email sign-in link signs the person in and clears the address', async () => {
    await page.goto(url + '#access_token=at&refresh_token=rt&expires_in=3600&token_type=bearer&type=magiclink')
    await page.locator('#pick, .hello').first().waitFor()
    assert.equal(await page.evaluate(() => location.hash), '', 'the tokens are not left in the address bar')
    assert.equal(await page.locator('#f1').count(), 0, 'no sign-in form: the link signed in')
  })
  await context.close()
  const context2 = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await mock(context2)
  const page2 = await context2.newPage()
  await step('a used sign-in link says so and keeps the code route open', async () => {
    await page2.goto(url + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    await page2.locator('#f1').waitFor()
    assert.match(await page2.getByRole('alert').innerText(), /already used or has expired/)
    assert.equal(await page2.evaluate(() => location.hash), '')
  })
  await context2.close()
}

// ---- Plans, sharing and teaching (owner decisions, 24 Oct 2026: individuals never pay; payment gates sharing) ----
// A signed-in context whose AlongSide answers the new routes as the real one will (lwl-backend #177 to #179). `handle` answers the new
// paths; anything it leaves alone falls through to the default mock (SetLists and so on).
const BACKEND = 'https://lwl-backend-mhgo.onrender.com'
const account = (over = {}) => ({ ...ACCOUNT_FREE, ...over, plans: { ...ACCOUNT_FREE.plans, ...(over.plans || {}) }, capabilities: { ...ACCOUNT_FREE.capabilities, ...(over.capabilities || {}) } })
async function planContext(viewport, handle, { permissions = [], allow = /status of 40[034]/ } = {}) {
  const context = await browser.newContext({ viewport, permissions })
  await context.addInitScript(() => localStorage.setItem('liann-hub-session-v1', JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: 9999999999 })))
  await mock(context)
  const seen = []
  await context.route(`${BACKEND}/learning/**`, async r => {
    const req = r.request(), path = new URL(req.url()).pathname
    let body = null; if (req.method() !== 'GET') { try { body = req.postDataJSON() } catch { body = null } }
    assert.equal(req.headers().authorization, 'Bearer at', `${req.method()} ${path} carries the bearer token`)
    const out = await handle({ path, method: req.method(), body })
    if (!out) return r.fallback()
    seen.push({ method: req.method(), path, body })
    return r.fulfill({ status: out[0], json: out[1] })
  })
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  // A refusal from AlongSide (the plan needed, a wrong class code) is an expected 4xx that Chromium also logs; anything else is a failure.
  page.on('console', m => { if (m.type() === 'error' && !(allow.test(m.text()) && m.location().url.startsWith(`${BACKEND}/learning/`))) errors.push(m.text()) })
  return { context, page, seen, errors }
}
const mainText = page => page.locator('main').innerText()

for (const viewport of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
  const tag = viewport.width < 500 ? 'phone' : 'desktop'

  {
    // A free account: everything personal is free; sharing is labelled, and the refusal leads to the plans page.
    const { context, page, seen, errors } = await planContext(viewport, ({ path, method, body }) => {
      if (path === '/learning/account') return [200, ACCOUNT_FREE]
      if (path === `/learning/setlists/${LIST}/shares`) return [403, { error: 'plan_required', plan: { url: 'https://app.lwliann.com/#plan' } }]
      if (path === '/learning/class-code') {
        if (body.code === 'WRNG-CODE') return [403, { error: 'class_code_unknown' }]
        if (body.code === 'NOMA-TCH2') return [403, { error: 'class_code_no_match' }]
        return [200, { ok: true, teacher: 'Ms Teach', className: 'Year 7 Mandarin' }]
      }
      return null
    })
    await step(`${tag}: free account: the Plan page marks Free as current, says plans are for sharing, and sells nothing`, async () => {
      await page.goto(url + '#plan'); await page.getByRole('heading', { name: 'Plans' }).waitFor()
      await page.locator('main .c', { hasText: 'Individual learners, 13+' }).getByText('Current plan').waitFor()
      const text = await mainText(page)
      assert.equal((text.match(/Current plan/g) || []).length, 1)
      assert.match(text, /Everything an individual does in their own account is free\. Plans are for sharing: a household, a class, an organisation\./)
      assert.doesNotMatch(text, /\b(buy|purchase|subscribe|checkout)\b/i, 'no plan can be bought yet')
      assert.equal(await page.locator('#teacher').count(), 0, 'no Teacher section without a Teacher plan')
      await page.click('[data-planf="Tutors"]')
      const teacher = page.locator('main .c', { hasText: 'Teachers who are not LiANN tutors' })
      assert.match(await teacher.innerText(), /Price to be set/); assert.equal(await teacher.getByText('Current plan').count(), 0)
      assert.equal(await teacher.locator('button:not([disabled])').count(), 0)
      await page.click('[data-planf="Organisations"]')
      assert.match(await page.locator('main .c', { hasText: 'PolyFlow Performance' }).innerText(), /Price to be set/)
      await noOverflow(page); await shot(page, `${tag}-plan-free`)
    })
    await step(`${tag}: free account: Share is labelled, the refusal says why and leads to the plans page`, async () => {
      await page.goto(url + '#library'); await page.locator('[data-list]').waitFor()
      const share = page.locator(`[data-sharelist="${LIST}"]`)
      assert.match(await share.innerText(), /Share · needs a plan/, 'the action stays visible so the boundary can be discovered')
      await share.click(); await page.locator('#sharef').waitFor()
      const form = await page.locator('#sharef').innerText()
      assert.match(form, /They receive their own copy\. Your list stays yours\./); assert.doesNotMatch(form, /\blink|\blive\b/i)
      await page.fill('#shareemail', 'friend@example.com'); await page.click('#sharef [type=submit]')
      await page.getByText('Sharing a SetList needs a plan. Your own SetLists stay free.').waitFor()
      assert.deepEqual(seen.find(x => x.path.endsWith('/shares')).body, { email: 'friend@example.com' })
      await noOverflow(page); await shot(page, `${tag}-share-needs-plan`)
      await page.getByRole('button', { name: 'See plans' }).click()
      await page.getByRole('heading', { name: 'Plans' }).waitFor()
      assert.equal(await page.evaluate(() => location.hash), '#plan'); assert.equal(await page.evaluate(() => location.origin), url.replace(/\/$/, ''), 'the hub never leaves for the address in the reply')
    })
    await step(`${tag}: joining a class: unknown code, a code for another address, then a listed address`, async () => {
      await page.goto(url + '#library'); await page.locator('#joinf').waitFor()
      for (const [code, text] of [['WRNG-CODE', 'That code is not in use.'], ['NOMA-TCH2', 'Your teacher has not listed this email.'], ['ABCD-EFGH', 'You joined “Year 7 Mandarin” with Ms Teach.']]) {
        await page.fill('#classcode', code); await page.click('#joinf [type=submit]'); await page.getByText(text).waitFor()
      }
      assert.deepEqual(seen.filter(x => x.path === '/learning/class-code').map(x => x.body.code), ['WRNG-CODE', 'NOMA-TCH2', 'ABCD-EFGH'])
      await noOverflow(page); await shot(page, `${tag}-join-class`)
    })
    await step(`${tag}: free account: no console errors`, async () => { assert.deepEqual(errors, []) })
    await context.close()
  }

  {
    // A Family plan holder: sharing works, an incoming list is accepted as a copy, and a list that needs a profile asks for one.
    const IN1 = 'aaaaaaaa-1111-4222-8333-444444444441', IN2 = 'aaaaaaaa-1111-4222-8333-444444444442', OUT1 = 'bbbbbbbb-1111-4222-8333-444444444441'
    const state = { incoming: [{ id: IN1, name: '<b>Greetings</b>', words: 3, from: 'friend@example.com' }, { id: IN2, name: 'Food', words: 5, from: 'pal@example.com' }],
      outgoing: [{ id: OUT1, setlistId: LIST, name: 'Tone pairs I miss', words: 2, email: 'old@example.com', state: 'pending' }, { id: 'bbbbbbbb-1111-4222-8333-444444444442', setlistId: LIST, name: 'Tone pairs I miss', words: 2, email: 'done@example.com', state: 'accepted' }],
      lists: [{ id: LIST, name: 'Tone pairs I miss', words: 2, source_product: 'liann-mahjong-tones' }], needProfile: false }
    const { context, page, seen, errors } = await planContext(viewport, ({ path, method, body }) => {
      if (path === '/learning/account') return [200, account({ plans: { household: 'family' }, capabilities: { shareSetlists: true, runHousehold: true } })]
      if (path === '/learning/setlists' && method === 'GET') return [200, { ok: true, setlists: state.lists }]
      if (path === '/learning/setlists/shares') return [200, { ok: true, incoming: state.incoming, outgoing: state.outgoing }]
      if (path === `/learning/setlists/${LIST}/shares`) { state.outgoing.unshift({ id: 'cccccccc-1111-4222-8333-444444444441', setlistId: LIST, name: 'Tone pairs I miss', words: 2, email: body.email, state: 'pending' }); return [201, { ok: true, share: { id: 'x', email: body.email, words: 2 } }] }
      if (path === `/learning/setlists/shares/${IN1}/accept`) { state.incoming = state.incoming.filter(x => x.id !== IN1); state.lists = [...state.lists, { id: 'dddddddd-1111-4222-8333-444444444441', name: '<b>Greetings</b>', words: 3, source_product: 'alongside' }]; return [201, { ok: true, setlist: { id: 'x', name: 'Greetings', words: 3 } }] }
      if (path === `/learning/setlists/shares/${IN2}/accept`) return [403, { error: 'learner_profile_required', profile: { url: `${BACKEND}/student#profile`, sessionPass: { url: `${BACKEND}/learning/session-pass`, next: '/student#profile' } } }]
      if (path === `/learning/setlists/shares/${OUT1}/revoke`) { state.outgoing = state.outgoing.map(x => x.id === OUT1 ? { ...x, state: 'revoked' } : x); return [200, { ok: true, revoked: true }] }
      return null
    })
    await step(`${tag}: plan holder: the Plan page marks the held plan and no other`, async () => {
      await page.goto(url + '#plan')
      await page.locator('main .c', { hasText: '3–6 profiles' }).getByText('Current plan').waitFor()
      assert.match(await page.locator('main .c').first().innerText(), /Family plan[\s\S]*Plan active/)
      assert.equal(await page.locator('main .c', { hasText: 'Individual learners, 13+' }).getByText('Current plan').count(), 0, 'Free is not the current plan for a plan holder')
      assert.equal((((await mainText(page)).match(/Current plan/g)) || []).length, 1)
    })
    await step(`${tag}: plan holder: a list sent to you shows as text, is accepted as a copy, and a list that needs a profile says so`, async () => {
      await page.goto(url + '#library'); await page.locator('#sharedwithyou').waitFor()
      const strip = page.locator('#sharedwithyou')
      assert.equal(await strip.locator('b').count(), 0, 'a list name cannot inject markup')
      assert.match(await strip.innerText(), /<b>Greetings<\/b>[\s\S]*3 words · from friend@example\.com[\s\S]*Food[\s\S]*5 words · from pal@example\.com/)
      assert.match(await strip.innerText(), /Accepting adds your own copy to your Library\./)
      await noOverflow(page); await shot(page, `${tag}-library-shared`)
      await page.click(`[data-acceptshare="${IN1}"]`)
      await page.locator('[data-share]', { hasText: '<b>Greetings</b>' }).waitFor({ state: 'detached' })
      await page.getByText('Tone pairs I miss').first().waitFor()
      assert.ok(seen.some(x => x.path === `/learning/setlists/shares/${IN1}/accept` && x.method === 'POST'))
      state.needProfile = true
      await page.click(`[data-acceptshare="${IN2}"]`)
      await page.getByText('Finish your learner profile, then accept the list.').waitFor()
      await page.locator('#finishprofile').waitFor()
    })
    await step(`${tag}: plan holder: share a list, see it as waiting, and withdraw one`, async () => {
      await page.reload(); await page.locator('[data-list]').first().waitFor()
      const share = page.locator(`[data-sharelist="${LIST}"]`)
      assert.equal((await share.innerText()).trim(), 'Share', 'a plan holder sees a plain Share')
      await share.click(); await page.fill('#shareemail', 'new@example.com'); await page.click('#sharef [type=submit]')
      await page.locator('#sharef').waitFor({ state: 'detached' })
      await page.locator('.sentlist li', { hasText: 'new@example.com' }).getByText('Waiting').waitFor()
      assert.match(await page.locator('.sentlist').innerText(), /done@example\.com[\s\S]*Accepted/)
      await page.locator('.sentlist li', { hasText: 'old@example.com' }).getByRole('button', { name: 'Withdraw' }).click()
      await page.locator('.sentlist li', { hasText: 'old@example.com' }).getByText('Withdrawn').waitFor()
      assert.equal(await page.locator('.sentlist li', { hasText: 'done@example.com' }).getByRole('button', { name: 'Withdraw' }).count(), 0, 'an accepted copy is never taken back')
      await noOverflow(page); await shot(page, `${tag}-library-sent`)
    })
    await step(`${tag}: plan holder: no console errors`, async () => { assert.deepEqual(errors, []) })
    await context.close()
  }

  {
    // A teacher: onboarding with the Terms shown in full, a class with its code, students listed by email, a seat withdrawn, a class archived.
    const CLS = 'eeeeeeee-1111-4222-8333-444444444441', SEAT1 = 'ffffffff-1111-4222-8333-444444444441'
    const T = { teacher: null, classes: [], seats: [], rejectNext: false }
    const { context, page, seen, errors } = await planContext(viewport, ({ path, method, body }) => {
      if (path === '/learning/account') return [200, account({ plans: { teacher: true }, capabilities: { teachStudents: true, shareSetlists: true } })]
      if (path === '/learning/teacher/policies') return [200, { ok: true, policies: [{ slug: 'terms', title: 'Terms', version: 3, body_text: 'The terms in full.' }, { slug: 'privacy', title: 'Privacy Promise', version: 2, body_text: 'The privacy promise in full.' }] }]
      if (path === '/learning/teacher/me') return [200, { email: 'ann.mingen@example.com', plan: { teacher: true, exempt: false, active: true }, liannTutor: false, teacher: T.teacher, classes: T.classes }]
      if (path === '/learning/teacher/onboard') { T.teacher = { id: 't1', fullName: body.fullName, onboarded: true }; return [200, { ok: true, teacherId: 't1' }] }
      if (path === '/learning/teacher/classes' && method === 'POST') { T.classes = [{ id: CLS, name: body.name, code: 'ABCD-EFGH', pending: 0, joined: 0 }]; return [201, { ok: true, class: T.classes[0] }] }
      if (path === `/learning/teacher/classes/${CLS}` && method === 'GET') return [200, { ok: true, class: { id: CLS, name: T.classes[0].name, code: 'ABCD-EFGH' }, seats: T.seats }]
      if (path === `/learning/teacher/classes/${CLS}/students` && method === 'POST') {
        if (T.rejectNext) { T.rejectNext = false; return [400, { error: 'guardian_email_matches_student', index: 1 }] }
        T.seats = body.students.map((x, i) => ({ id: i ? 'ffffffff-1111-4222-8333-44444444444' + (i + 1) : SEAT1, name: x.name, to: x.guardianEmail || x.studentEmail, isMinor: x.isMinor, status: 'pending', joinedAt: null }))
        T.classes[0].pending = T.seats.length; return [201, { ok: true, added: T.seats.length, skipped: 0 }]
      }
      if (path === `/learning/teacher/classes/${CLS}/students/${SEAT1}` && method === 'DELETE') { T.seats = T.seats.filter(x => x.id !== SEAT1); T.classes[0].pending = T.seats.length; return [200, { ok: true }] }
      if (path === `/learning/teacher/classes/${CLS}` && method === 'DELETE') { T.classes = []; return [200, { ok: true, archived: true }] }
      return null
    }, { permissions: ['clipboard-read', 'clipboard-write'] })
    await step(`${tag}: teacher: onboarding shows the Terms in full and needs the box ticked`, async () => {
      await page.goto(url + '#plan'); await page.locator('#tonboard').waitFor()
      await page.locator('#tonboard details.policy summary', { hasText: 'Terms (version 3)' }).click()
      await page.getByText('The terms in full.').waitFor()
      assert.match(await page.locator('#tonboard').innerText(), /Lessons, bookings and payouts are for LiANN tutors, not for teachers\./)
      await page.fill('#tname', 'Ms Teach'); await page.click('#tonboard [type=submit]')
      await page.getByText('Tick the box to agree to the Terms and Privacy Promise.').waitFor()
      await page.check('#tagree'); await page.click('#tonboard [type=submit]')
      await page.getByRole('heading', { name: 'Your classes' }).waitFor()
      assert.deepEqual(seen.find(x => x.path === '/learning/teacher/onboard').body, { fullName: 'Ms Teach', agreements: { terms: true, privacy: true } })
      await noOverflow(page); await shot(page, `${tag}-teacher-onboarded`)
    })
    await step(`${tag}: teacher: a class has a code, students are listed by email, a child by a guardian`, async () => {
      await page.fill('#cname', 'Year 7 Mandarin'); await page.click('#newclass [type=submit]')
      await page.locator('#theclasscode').waitFor()
      assert.equal(await page.locator('#theclasscode').innerText(), 'ABCD-EFGH')
      assert.match(await page.locator('#teacher').innerText(), /Students sign in with the email you listed \(for a child, the parent or guardian’s email\) and enter this code\./)
      await page.click('#copycode'); await page.getByText('Code copied').waitFor()
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'ABCD-EFGH')
      await page.fill('[data-row="0"][data-f="name"]', 'Adult A'); await page.fill('[data-row="0"][data-f="email"]', 'adult@example.com')
      await page.fill('[data-row="1"][data-f="name"]', 'Kid K'); await page.selectOption('[data-row="1"][data-f="minor"]', '1')
      assert.match(await page.locator('[data-row="1"][data-f="email"]').getAttribute('placeholder'), /Parent or guardian/)
      await page.fill('[data-row="1"][data-f="email"]', 'adult@example.com')
      T.rejectNext = true; await page.click('#addseats [type=submit]')
      await page.getByText('Student 2: the parent or guardian needs a different email from the student.').waitFor()
      assert.equal(await page.inputValue('[data-row="1"][data-f="email"]'), 'adult@example.com', 'what was typed is kept after a refusal')
      await page.fill('[data-row="1"][data-f="email"]', 'parent@example.com'); await page.click('#addseats [type=submit]')
      await page.locator('.sentlist li', { hasText: 'Kid K' }).waitFor()
      assert.deepEqual(seen.filter(x => x.path.endsWith('/students') && x.method === 'POST').pop().body.students,
        [{ name: 'Adult A', isMinor: false, studentEmail: 'adult@example.com' }, { name: 'Kid K', isMinor: true, guardianEmail: 'parent@example.com' }])
      assert.match(await page.locator('.sentlist li', { hasText: 'Kid K' }).innerText(), /child, via parent@example\.com · Waiting/)
      await noOverflow(page); await shot(page, `${tag}-teacher-class`)
    })
    await step(`${tag}: teacher: withdraw a seat, archive the class`, async () => {
      await page.locator('.sentlist li', { hasText: 'Adult A' }).getByRole('button', { name: 'Withdraw' }).click()
      await page.locator('.sentlist li', { hasText: 'Adult A' }).waitFor({ state: 'detached' })
      page.once('dialog', d => d.accept())
      await page.click('#archiveclass')
      await page.getByRole('heading', { name: 'Your classes' }).waitFor()
      assert.equal(await page.locator('[data-class]').count(), 0)
      assert.ok(seen.some(x => x.method === 'DELETE' && x.path === `/learning/teacher/classes/${CLS}`))
    })
    await step(`${tag}: teacher: no console errors`, async () => { assert.deepEqual(errors, []) })
    await context.close()
  }
}

{
  // Founder, LiANN tutor, and an AlongSide that does not have the new routes yet.
  const founder = await planContext({ width: 1280, height: 860 }, ({ path }) => {
    if (path === '/learning/account') return [200, account({ accountType: 'founder', capabilities: { shareSetlists: true, teachStudents: true, runHousehold: true, runOrganisation: true } })]
    if (path === '/learning/teacher/policies') return [200, { ok: true, policies: [] }]
    if (path === '/learning/teacher/me') return [200, { email: 'ann.mingen@example.com', plan: { teacher: false, exempt: true, active: true }, liannTutor: false, teacher: null, classes: [] }]
    return null
  })
  await step('founder: the Plan page says so, and teaching is open without a plan; with no policy text the website is linked', async () => {
    await founder.page.goto(url + '#plan'); await founder.page.locator('#tonboard').waitFor()
    assert.match(await founder.page.locator('main .c').first().innerText(), /Founder[\s\S]*Every plan is open to this account/)
    assert.match(await founder.page.locator('#tonboard').innerText(), /The full text is on the website: Terms and Privacy Promise\./)
    assert.equal(await founder.page.locator('#tonboard a[href="https://lwliann.com/terms"]').count(), 1)
    assert.deepEqual(founder.errors, [])
  })
  await founder.context.close()

  const tutor = await planContext({ width: 1280, height: 860 }, ({ path }) => {
    if (path === '/learning/account') return [200, account({ accountType: 'tutor', capabilities: { shareSetlists: true, teachStudents: true } })]
    if (path === '/learning/teacher/me') return [200, { email: 'ann.mingen@example.com', plan: { teacher: false, exempt: false, active: false }, liannTutor: true, teacher: null, classes: [] }]
    return null
  })
  await step('a LiANN tutor sees nothing teacher-specific in the hub', async () => {
    await tutor.page.goto(url + '#plan'); await tutor.page.getByRole('heading', { name: 'Plans' }).waitFor()
    await tutor.page.waitForTimeout(300)
    assert.equal(await tutor.page.locator('#teacher').count(), 0)
    assert.match(await tutor.page.locator('main .c').first().innerText(), /LiANN tutor/)
    assert.deepEqual(tutor.errors, [])
  })
  await tutor.context.close()

  // The plan check fails (a cold or busy backend): the hub says so and never calls the account Free; Try again recovers.
  let probeOk = false
  const flaky = await planContext({ width: 1280, height: 860 }, ({ path }) => {
    if (path === '/learning/account') return probeOk ? [200, account({ plans: { household: 'family' }, capabilities: { shareSetlists: true } })] : [503, { error: 'access_check_unavailable' }]
    return null
  }, { allow: /status of (40[034]|503)/ })
  await step('a failed plan check says so, is never shown as Free, offers no sharing, and recovers on Try again', async () => {
    await flaky.page.goto(url + '#plan'); await flaky.page.getByText('Could not be checked').waitFor()
    assert.equal(await flaky.page.getByText('Current plan').count(), 0, 'no plan is marked while the check has failed')
    assert.doesNotMatch(await flaky.page.locator('main .c').first().innerText(), /Free/)
    await flaky.page.goto(url + '#library'); await flaky.page.reload(); await flaky.page.locator('[data-list]').waitFor()
    assert.equal(await flaky.page.locator('[data-sharelist], #joinf').count(), 0)
    probeOk = true
    await flaky.page.click('[data-nav="plan"]'); await flaky.page.locator('main .c', { hasText: '3–6 profiles' }).getByText('Current plan').waitFor()
    assert.match(await flaky.page.locator('main .c').first().innerText(), /Family plan/)
    assert.deepEqual(flaky.errors, [])
  })
  await flaky.context.close()

  // An older AlongSide answers 404 to the new routes: the hub looks exactly as before, with Free as the current plan.
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await context.addInitScript(() => localStorage.setItem('liann-hub-session-v1', JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: 9999999999 })))
  await mock(context)
  await context.route(`${BACKEND}/learning/account`, r => r.fulfill({ status: 404, json: {} }))
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await step('an AlongSide without the new routes: Free is current, and there is no Share, no Join a class, no Teacher', async () => {
    await page.goto(url + '#plan'); await page.getByRole('heading', { name: 'Plans' }).waitFor()
    await page.locator('main .c', { hasText: 'Individual learners, 13+' }).getByText('Current plan').waitFor()
    await page.goto(url + '#library'); await page.locator('[data-list]').waitFor()
    assert.equal(await page.locator('[data-sharelist], #joinf, #sharedwithyou').count(), 0)
    assert.deepEqual(errors, [])
  })
  await context.close()
}

await browser.close(); server.close()
if (failures) { console.log(`${failures} smoke step(s) failed`); process.exit(1) }
console.log('Smoke test passed')
