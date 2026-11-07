# Makes the hub's reader pages (1067 x 1600 WebP) from a folder of Issue One page PNGs, named the way
# data/comics.json expects: cover-a-page, 000 (inside front cover), 001-022, cover-b-page.
# Works for the v28 Clean Pencils and Cinematic Painted Drive folders.
#
#   powershell -ExecutionPolicy Bypass -File make-reader-pages.ps1 -Source "G:\My Drive\...\Bella & LiANN Issue1_Cinematic_Painted_v28_Final"
#
# Writes the WebP files to a "reader-pages" folder inside -Source. If -Source is in Google Drive for desktop, Drive
# syncs them back, and the cloud session uploads them to the private liann-reader bucket (docs/COMIC-PROTECTION.md).
# Needs Node.js 18 or newer. The image library (sharp) goes into a temporary folder that is deleted afterwards.
param([Parameter(Mandatory = $true)][string]$Source, [string]$Out)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Source -PathType Container)) { throw "Folder not found: $Source" }
if (-not $Out) { $Out = Join-Path $Source 'reader-pages' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is not installed. Get it from https://nodejs.org and run this again.' }

$work = Join-Path ([IO.Path]::GetTempPath()) ('liann-reader-pages-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  Push-Location $work
  Write-Host 'Installing the image library (one minute)...'
  & npm install --silent --no-audit --no-fund sharp@0.33.5 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'npm install sharp failed.' }
  @'
const fs = require('fs'), path = require('path'), sharp = require('sharp')
const [src, out] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const nameOf = f => {
  if (/cover[ _]variant[ _]1/i.test(f)) return 'cover-a-page'
  if (/cover[ _]variant[ _]2/i.test(f)) return 'cover-b-page'
  if (/inside[ _]front[ _]cover/i.test(f)) return '000'
  const m = f.match(/page[ _](\d{1,2})[ _]/i)
  return m ? String(Number(m[1])).padStart(3, '0') : null
}
;(async () => {
  const seen = {}
  for (const f of fs.readdirSync(src).filter(f => /\.png$/i.test(f)).sort()) {
    const k = nameOf(f)
    if (!k) { console.log('skipped (name not recognised): ' + f); continue }
    if (seen[k]) throw new Error(`two files would both be ${k}.webp: ${seen[k]} and ${f}`)
    seen[k] = f
    const dest = path.join(out, k + '.webp')
    await sharp(path.join(src, f)).removeAlpha().resize(1067, 1600, { fit: 'cover', position: 'centre' }).webp({ quality: 82, effort: 6 }).toFile(dest)
    console.log(`${k}.webp  ${Math.round(fs.statSync(dest).size / 1024)} KB  <- ${f}`)
  }
  const want = ['cover-a-page', 'cover-b-page', ...Array.from({ length: 23 }, (_, i) => String(i).padStart(3, '0'))]
  const missing = want.filter(k => !seen[k])
  console.log(missing.length ? 'MISSING: ' + missing.join(', ') : `All ${want.length} pages made.`)
  if (missing.length) process.exitCode = 1
})().catch(e => { console.error(e.message); process.exit(1) })
'@ | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $work 'make.cjs')
  & node (Join-Path $work 'make.cjs') $Source $Out
  if ($LASTEXITCODE -ne 0) { throw 'Some pages were not made; see above.' }
  Write-Host "Done. The pages are in: $Out"
} finally {
  Pop-Location
  Remove-Item -Recurse -Force -LiteralPath $work -ErrorAction SilentlyContinue
}
