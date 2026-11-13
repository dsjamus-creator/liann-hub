// Parent/child browser contract. Set ADMIN_BACKEND_DIR to also exercise the
// current AlongSide dashboard and bridge, without any production requests.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { serve } from '../scripts/serve.mjs'

const server = await serve(0), hub = `http://127.0.0.1:${server.address().port}`
const backend = 'https://lwl-backend-mhgo.onrender.com'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' })
const fixture = `<!doctype html><h2 id="section">Overview</h2><input id="stEmail"><script>
addEventListener('message',e=>{if(e.origin===${JSON.stringify(hub)}&&e.data.type==='liann-admin:navigate'){document.querySelector('#section').textContent=e.data.section;document.documentElement.dataset.theme=e.data.theme.t}});
parent.postMessage({type:'liann-admin:ready'},${JSON.stringify(hub)});
</script>`
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }), errors = [], requests = []
    let permitted = true, frameLoads = 0
    await context.addInitScript(origin => { if (location.origin === origin) localStorage.setItem('liann-hub-tour-done', 'true') }, hub)
    await context.route('https://api.pinyintiles.com/**', r => r.fulfill({ json: { authentication: { enabled: true, supabaseUrl: 'https://demo.supabase.co', publishableKey: 'pk-test' } } }))
    await context.route('https://demo.supabase.co/**', r => r.fulfill({ json: new URL(r.request().url()).pathname.endsWith('/user')
      ? { email: 'owner@example.test', email_confirmed_at: '2026-10-12' }
      : { access_token: 'at', refresh_token: 'rt', expires_in: 3600, user: { email: 'owner@example.test' } } }))
    await context.route('**/data/comics.json', r => r.fulfill({ json: [] }))
    await context.route(`${backend}/**`, async r => {
      const path = new URL(r.request().url()).pathname
      if (path === '/hub-admin') {
        frameLoads++
        let html = fixture
        if (process.env.ADMIN_BACKEND_DIR) html = (await readFile(`${process.env.ADMIN_BACKEND_DIR}/public/admin.html`, 'utf8'))
          .replace('<head>', `<head><script src="/hub-admin-bridge.js" data-hub-origin="${hub}"></script>`)
          .replace('</head>', '<link rel="stylesheet" href="/hub-admin.css"></head>')
        return r.fulfill({ contentType: 'text/html', body: html })
      }
      if (['/shell.css', '/shell.js', '/hub-admin.css', '/hub-admin-bridge.js'].includes(path)) return r.fulfill({
        contentType: path.endsWith('.js') ? 'text/javascript' : 'text/css',
        body: await readFile(`${process.env.ADMIN_BACKEND_DIR}/public${path}`, 'utf8'),
      })
      if (path === '/fonts/nunito-black.ttf') return r.fulfill({ contentType: 'font/ttf', body: await readFile(`${process.env.ADMIN_BACKEND_DIR}/public${path}`) })
      if (path.startsWith('/admin/')) {
        assert.equal(r.request().headers().authorization, 'Bearer at')
        assert.ok(!r.request().headers().cookie)
        requests.push({ path, method: r.request().method(), body: r.request().postData() })
        if (!permitted) return r.fulfill({ status: 403, json: { error: 'super_admin_only' } })
        if (path === '/admin/whoami') return r.fulfill({ json: { email: 'owner@example.test', superAdmin: true, permissions: [] } })
        return r.fulfill({ json: { tutors: [], students: [], waitlist: [], intros: [], upcoming: [], recentFlags: [], cases: [], items: [], staff: [], reports: [], audit: [], connected: true, campaign: {}, recipients: [], deliveries: [], permissions: [] } })
      }
      if (path === '/learning/household') return r.fulfill({ status: 404, json: {} })
      if (path.startsWith('/learning/')) return r.fulfill({ json: { setlists: [], institutions: [], words: [], milestones: [] } })
      throw new Error(`Unexpected backend request: ${path}`)
    })
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(hub)
    await page.fill('#em', 'owner@example.test'); await page.click('#f1 [type=submit]')
    await page.locator('#c0').pressSequentially('246810')
    await page.locator('#admin-frame').waitFor()
    assert.equal(await page.locator('#pick').count(), 0, 'super admin opens automatically without profile selection')
    assert.ok(page.url().endsWith('#admin/overview'))
    const rail = page.getByRole('navigation', { name: 'Super Admin', exact: true })
    assert.equal(await rail.locator('[data-admin]').count(), 12)
    const frame = page.frameLocator('#admin-frame')
    await page.locator('[data-admin="staff"]').click()
    await frame.locator('#stEmail').fill('unfinished@example.test')
    // A hub rerender must preserve the iframe and its unfinished form.
    await page.locator('#apbtn').click()
    await page.locator('#apbtn').click()
    await page.locator('[data-admin="staff"]').click()
    assert.equal(await frame.locator('#stEmail').inputValue(), 'unfinished@example.test')
    assert.equal(frameLoads, 1)
    if (process.env.ADMIN_BACKEND_DIR) {
      await frame.locator('#stName').fill('Test staff')
      await frame.locator('#stAdd').click()
      await page.waitForFunction(() => document.querySelector('#admin-frame') !== null)
      await frame.locator('#stEmail').waitFor({ state: 'visible' })
      for (let n = 0; n < 50 && !requests.some(r => r.path === '/admin/staff' && r.method === 'POST'); n++) await page.waitForTimeout(50)
      assert.ok(requests.some(r => r.path === '/admin/staff' && r.method === 'POST'), 'existing Save member action reaches the authenticated backend')
      await page.locator('[data-admin="tutors"]').click()
      await frame.locator('#v-tutors').waitFor({ state: 'visible' })
      assert.equal(await frame.locator('html').getAttribute('data-theme'), 'dark')
    }
    const bounds = await rail.boundingBox(), main = await page.locator('#main').boundingBox()
    assert.ok(bounds.x >= main.x + main.width - 1, 'admin navigation sits to the right of hub content')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways overflow')
    if (process.env.SHOTS) await page.screenshot({ animations: 'disabled', path: `${process.env.SHOTS}/hub-super-admin-${viewport.width}.png` })
    // Losing server permission removes both the frame and the privileged rail.
    permitted = false
    if (process.env.ADMIN_BACKEND_DIR) await page.locator('[data-admin="staff"]').click()
    else await page.reload()
    if (process.env.ADMIN_BACKEND_DIR) await rail.waitFor({ state: 'detached' })
    else await page.locator('#main').waitFor()
    assert.equal(await page.locator('#admin-frame').count(), 0)
    assert.equal(errors.length, 0, errors.join('\n'))
    await context.close()
    console.log(`PASS ${viewport.width}: automatic admin entry, right rail, preserved forms, authenticated actions and revoked access`)
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
