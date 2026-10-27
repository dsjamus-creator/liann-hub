// Guards for the hub's security baseline: response headers, the page policy, and what is (not) published.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8')

test('every page is served with the security headers', async () => {
  const all = (await read('_headers')).split(/\n(?=\S)/)[0]
  for (const h of ['X-Content-Type-Options: nosniff', 'Referrer-Policy: no-referrer', 'X-Frame-Options: DENY', "frame-ancestors 'none'", 'Strict-Transport-Security: max-age=', 'Cross-Origin-Opener-Policy:', 'Permissions-Policy: camera=(), microphone=(), geolocation=()']) assert.ok(all.includes(h), `missing ${h}`)
  const hsts = /Strict-Transport-Security: max-age=(\d+)(.*)/.exec(all)
  assert.ok(Number(hsts[1]) >= 15552000, 'HSTS for at least six months')
  assert.ok(!/includeSubDomains|preload/i.test(hsts[2]), 'HSTS is not extended to the other lwliann.com sites without a decision')
})

test('the content security policy stays tight', async () => {
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(await read('index.html'))[1]
  const dir = name => (new RegExp(`(?:^|; )${name} ([^;]*)`).exec(csp) || [])[1]
  assert.equal(dir('default-src'), "'self'")
  assert.equal(dir('script-src'), "'self'", 'no inline or eval scripts, no outside scripts')
  assert.equal(dir('object-src'), "'none'"); assert.equal(dir('base-uri'), "'none'"); assert.equal(dir('form-action'), "'none'")
  assert.ok(!/unsafe-eval|unsafe-inline/.test(dir('script-src')))
  for (const [name, list] of Object.entries({ 'connect-src': dir('connect-src'), 'img-src': dir('img-src') })) assert.ok(!/(^| )\*( |$)|http:/.test(list), `${name} has no wildcard or plain http`)
})

test('nothing in the published site holds a secret, and source files are not published', async () => {
  const ignore = await read('.assetsignore')
  for (const p of ['tests', 'scripts', 'docs', 'worker', 'node_modules', '.git', '.github', '.devcontainer', '.env', 'package.json', 'wrangler.jsonc']) assert.ok(ignore.split(/\r?\n/).includes(p), `${p} is excluded from the upload`)
  const files = [...await readdir(new URL('../src', import.meta.url)).then(l => l.map(f => `src/${f}`)), 'index.html', 'data/comics.json', 'data/downloads.json', 'wrangler.jsonc', '.github/workflows/deploy.yml']
  for (const f of files) {
    const text = await read(f)
    assert.ok(!/(sk|rk)_(live|test)_[A-Za-z0-9]{10,}/.test(text), `${f}: a Stripe-style secret key`)
    assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text), `${f}: a private key`)
    assert.ok(!/cfat_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\./.test(text), `${f}: an API token or JWT`)
  }
})

test('security.txt gives a contact and an expiry that has not passed', async () => {
  const t = await read('.well-known/security.txt')
  assert.match(t, /^Contact: mailto:\S+@\S+$/m)
  const expires = /^Expires: (\S+)$/m.exec(t)[1]
  assert.ok(new Date(expires) > new Date(), 'security.txt has expired: renew its Expires date')
})
