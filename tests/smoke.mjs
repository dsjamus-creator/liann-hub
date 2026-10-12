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

async function mock(context, { student = true } = {}) {
  const seen = { auth: [] }
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
    if (!student) return r.fulfill({ status: 403, json: { error: 'not_a_student' } })
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
  page.on('console', m => { if (m.type() === 'error' && !(/status of 403/.test(m.text()) && m.location().url.endsWith('/auth/v1/verify'))) errors.push(m.text()) })
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
    assert.match(await tones.innerText(), /Unity build on its way/)
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
  await step(`${tag}: Downloads lists the manifest and offers only checked files (PolyFlow)`, async () => {
    await page.goto(url + '#downloads'); await page.locator('[data-slot]').first().waitFor()
    assert.equal(await page.locator('[data-slot]').count(), 13)
    assert.equal(await page.locator('[data-slot] a[download]').count(), 1)
    assert.equal(await page.locator('[data-slot="polyflow/windows"] a[download]').getAttribute('href'), 'https://downloads.lwliann.com/polyflow/windows/0.1.0/PolyFlow-Setup-0.1.0.exe')
    assert.equal(await page.locator('[data-slot="mahjong-tones/test-build"]').count(), 1)
    assert.doesNotMatch(await page.locator('main').innerText(), /signing|redistribution/i)
    await noOverflow(page); await shot(page, `${tag}-downloads`)
  })
  await step(`${tag}: Read and Kids pages render their manifest slots`, async () => {
    await page.goto(url + '#read'); await page.locator('[data-slot="read/episodes"]').waitFor()
    await page.goto(url + '#kids'); await page.locator('[data-slot="kids/colouring/flight"]').waitFor()
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
  const context = await browser.newContext()
  await mock(context, { student: false })
  await context.addInitScript(() => localStorage.setItem('liann-hub-session-v1', JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: 9999999999 })))
  const page = await context.newPage()
  await step('returning user without a learner profile sees a helpful Library message', async () => {
    await page.goto(url + '#library')
    await page.getByText('Your Library starts when you save your first words').waitFor()
  })
  await context.close()
}

await browser.close(); server.close()
if (failures) { console.log(`${failures} smoke step(s) failed`); process.exit(1) }
console.log('Smoke test passed')
