// The support surface: the widget copy is the canonical one, the FAQ is well formed, and the page escapes what it shows.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { NAV } from '../src/config.js'
import { PAGES } from '../src/views.js'

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8')
// The canonical widget is lwl-backend public/support/support-widget.js; docs/SUPPORT.md there names this hash.
const WIDGET_SHA256 = '0f33530a36074e1fbf106be97ec42e16ce45dc3b2e45a60bac0c8ac70fb6f8a6'

test('the widget is byte for byte the canonical copy', async () => {
  assert.equal(createHash('sha256').update(await read('src/support-widget.js')).digest('hex'), WIDGET_SHA256,
    'copy the widget again from lwl-backend public/support/support-widget.js and update the pinned hash')
})

test('the widget builds markup only with text, so nothing typed can inject HTML', async () => {
  const body = (await read('src/support-widget.js')).replace(/\/\*[\s\S]*?\*\//, '')
  assert.doesNotMatch(body, /innerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/)
})

test('the FAQ is well formed and says nothing the hub cannot stand behind', async () => {
  const faq = JSON.parse(await read('data/faq.json'))
  assert.equal(faq.version, 1)
  const ids = new Set()
  for (const f of faq.items) {
    assert.match(f.id, /^[a-z0-9-]+$/); assert.ok(!ids.has(f.id), `${f.id} is unique`); ids.add(f.id)
    assert.ok(typeof f.q === 'string' && f.q.endsWith('?'), `${f.id} has a question`)
    assert.ok(typeof f.a === 'string' && f.a.length > 20, `${f.id} has an answer`)
    if (f.steps) assert.ok(Array.isArray(f.steps) && f.steps.every(s => typeof s === 'string' && s.length > 5), `${f.id} steps are text`)
    assert.doesNotMatch(JSON.stringify(f), /\u2014|£|\$\d|€/, `${f.id} has no em dash and no invented price`)
  }
  assert.ok(ids.has('free') && ids.has('contact') && ids.has('safety'))
})

test('Help is a page in the menu, the help button opens it, and FAQ text is escaped', async () => {
  assert.ok(NAV.some(([k, l]) => k === 'help' && l === 'Help')); assert.equal(typeof PAGES.help, 'function')
  const html = PAGES.help({ faq: [{ id: 'x', q: '<b>Q?</b>', a: '<img src=x onerror=alert(1)>', steps: ['<i>one</i>'] }], user: { email: 'a@b.test' } })
  assert.ok(!html.includes('<img') && !html.includes('<b>Q') && !html.includes('<i>one'), 'FAQ text is escaped')
  assert.match(html, /id="support-mount"/)
  assert.match(PAGES.help({ faq: null, user: {} }), /could not be loaded/); assert.match(PAGES.help({ user: {} }), /Loading the questions/)
  const views = await read('src/views.js'); assert.match(views, /aria-label="Help and support" data-nav="help"/)
})

test('the page policy still allows the support calls and no outside scripts', async () => {
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(await read('index.html'))[1]
  const dir = name => (new RegExp(`(?:^|; )${name} ([^;]*)`).exec(csp) || [])[1]
  assert.equal(dir('script-src'), "'self'"); assert.ok(dir('connect-src').includes('https://lwl-backend-mhgo.onrender.com'))
  assert.ok(dir('style-src').includes("'unsafe-inline'"), 'the widget adds one style element')
})
