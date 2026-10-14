// Browser smoke test: the whole hub against mocked Pinyin API, Supabase and AlongSide. No real network.
// CHROME_PATH defaults to the Chromium preinstalled in Claude Code cloud sessions.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
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
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await context.route('https://pinyin-tiles-api-staging.onrender.com/v1/auth/config', r => r.fulfill({ json: { authentication: { enabled: true, supabaseUrl: 'https://demo.supabase.co', publishableKey: 'pk-test' } } }))
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
    await page.locator('#c0').pressSequentially('111111')
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').innerText(), /wrong or has expired/)
  })
  await step(`${tag}: the right code signs in and shows "Who's learning?"`, async () => {
    await page.locator('#c0').pressSequentially('246810')
    await page.locator('#pick').waitFor()
    assert.match(await page.locator('.who').innerText(), /Ann Mingen/)
  })
  await step(`${tag}: hub home lists games; Game 3 is the Unity app`, async () => {
    await page.click('#pick')
    await page.locator('.hello').waitFor()
    const tones = page.locator('[data-app="tones"]').first()
    assert.match(await tones.innerText(), /Unity app/)
    assert.match(await tones.innerText(), /Version 0\.2\.0 · Download/, 'the Windows build is in the manifest')
    assert.equal(await tones.locator('a[href*="/tones"]').count(), 0)
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
  await step(`${tag}: Downloads lists the manifest and offers only checked files (PolyFlow, Mahjong Tones)`, async () => {
    await page.goto(url + '#downloads'); await page.locator('[data-slot]').first().waitFor()
    assert.equal(await page.locator('[data-slot]').count(), 13)
    assert.equal(await page.locator('[data-slot] a[download]').count(), 2)
    assert.equal(await page.locator('[data-slot="polyflow/windows"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/polyflow/windows/0.1.0/PolyFlow-Setup-0.1.0.exe')
    assert.equal(await page.locator('[data-slot="mahjong-tones/test-build"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/mahjong-tones/windows/0.2.0/LiANN-Mahjong-Tones-Windows-0.2.0.zip')
    assert.doesNotMatch(await page.locator('main').innerText(), /signing|redistribution/i)
    await noOverflow(page); await shot(page, `${tag}-downloads`)
  })
  await step(`${tag}: Read and Kids pages render their manifest slots`, async () => {
    await page.goto(url + '#read'); await page.locator('[data-slot="read/episodes"]').waitFor()
    await page.goto(url + '#kids'); await page.locator('[data-slot="kids/colouring/flight"]').waitFor()
    assert.match(await page.locator('main').innerText(), /Colour the characters[\s\S]*Colour by tone[\s\S]*Tone stars/)
    assert.equal(await page.locator('main a[download]').count(), 0, 'kids files are not offered before they are in the manifest')
    await noOverflow(page); await shot(page, `${tag}-kids`)
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

await browser.close(); server.close()
if (failures) { console.log(`${failures} smoke step(s) failed`); process.exit(1) }
console.log('Smoke test passed')
