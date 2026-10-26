import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('/hub and /hub/ send people to the hub Downloads page', async () => {
  const rules = (await readFile(new URL('../_redirects', import.meta.url), 'utf8')).split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.trim().split(/\s+/))
  assert.deepEqual(rules, [['/hub', '/#downloads', '302'], ['/hub/', '/#downloads', '302']])
})

test('_redirects is uploaded with the site, not ignored', async () => {
  const ignore = (await readFile(new URL('../.assetsignore', import.meta.url), 'utf8')).split('\n').map(l => l.trim())
  assert.ok(!ignore.includes('_redirects'))
})
