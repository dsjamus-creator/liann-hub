import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8')
const base = 'apps/liann-hub-android'

test('the Android app is the hub, in one consistent package, pointed at app.lwliann.com', async () => {
  const gradle = await read(`${base}/app/build.gradle`)
  const manifest = await read(`${base}/app/src/main/AndroidManifest.xml`)
  const twa = JSON.parse(await read(`${base}/twa-manifest.json`))
  assert.equal(twa.packageId, 'com.lwliann.hub')
  assert.match(gradle, /applicationId: 'com\.lwliann\.hub'/); assert.match(gradle, /namespace "com\.lwliann\.hub"/); assert.match(gradle, /applicationId "com\.lwliann\.hub"/)
  assert.match(manifest, /package="com\.lwliann\.hub"/)
  for (const f of await readdir(new URL(`../${base}/app/src/main/java/com/lwliann/hub`, import.meta.url))) assert.match(await read(`${base}/app/src/main/java/com/lwliann/hub/${f}`), /^package com\.lwliann\.hub;/m, `${f} is in the hub package`)
  assert.match(gradle, /hostName: 'app\.lwliann\.com'/); assert.match(gradle, /launchUrl: '\/'/)
  assert.match(gradle, /'https:\/\/app\.lwliann\.com\/manifest\.webmanifest'/); assert.equal(twa.webManifestUrl, 'https://app.lwliann.com/manifest.webmanifest')
  assert.match(gradle, /launcherName: 'LiANN HUB'/)
  assert.match(await read(`${base}/app/src/main/res/values/strings.xml`), /\\"site\\": \\"https:\/\/app\.lwliann\.com\\"/)
  for (const [name, text] of [['build.gradle', gradle], ['AndroidManifest.xml', manifest], ['twa-manifest.json', JSON.stringify(twa)]]) assert.doesNotMatch(text, /polyflow|onrender/i, `${name} has no PolyFlow leftovers`)
})

test('no signing key or password is in the repository; release signing comes from the environment only', async () => {
  const gradle = await read(`${base}/app/build.gradle`)
  assert.match(gradle, /System\.getenv\('HUB_ANDROID_KEYSTORE'\)/)
  assert.doesNotMatch(gradle, /storePassword\s+['"]/, 'no literal password')
  assert.match(await read(`${base}/.gitignore`), /\/android\.keystore/)
  const wf = await read('.github/workflows/hub-android.yml')
  assert.match(wf, /secrets\.HUB_ANDROID_KEYSTORE_B64/); assert.match(wf, /permissions:\n  contents: read/)
  assert.doesNotMatch(wf, /pull_request_target/)
  assert.match(wf, /if: github\.event_name == 'workflow_dispatch'\n\s+env:\n\s+GH_TOKEN/, 'the release step runs only when started by hand')
  assert.match(wf, /gh release create[^\n]*--draft --prerelease/, 'the release is always a draft')
  assert.equal((wf.match(/contents: write/g) || []).length, 1, 'write access is granted once, for the draft release')
})
