// Minimal static server for local use and the smoke test. Serves this folder only.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }

export function serve(port = Number(process.env.PORT) || 4173) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const file = normalize(join(root, path.endsWith('/') ? path + 'index.html' : path))
    if (!file.startsWith(root + sep) || /[\\/]\.|node_modules/.test(file.slice(root.length))) { res.writeHead(404).end(); return }
    try {
      // Match Worker static-asset directory routes, then the Hub's existing /page -> page.html convention.
      let served = file
      try { if ((await stat(file)).isDirectory()) served = join(file, 'index.html') } catch {}
      const body = await readFile(served).catch(e => { if (e.code === 'ENOENT' && !extname(file)) { served = file + '.html'; return readFile(served) } throw e })
      res.writeHead(200, { 'content-type': types[extname(served)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body)
    } catch { res.writeHead(404).end('Not found') }
  })
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok(server)))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) serve().then(s => console.log(`Hub at http://localhost:${s.address().port}/`))
