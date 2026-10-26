import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('the desktop installer workflow only drafts a release when started by hand, and publishes nothing', async () => {
  const wf = await readFile(new URL('../.github/workflows/hub-desktop-installers.yml', import.meta.url), 'utf8')
  assert.match(wf, /draft-release:\n\s+if: github\.event_name == 'workflow_dispatch'/)
  assert.match(wf, /gh release create[^\n]*--draft --prerelease/)
  assert.equal((wf.match(/contents: write/g) || []).length, 1, 'write access is granted once, to the draft-release job')
  assert.match(wf, /permissions:\n  contents: read/, 'the workflow default stays read-only')
  assert.doesNotMatch(wf, /r2 object put|CLOUDFLARE_API_TOKEN/, 'no job here uploads to the downloads bucket')
})
