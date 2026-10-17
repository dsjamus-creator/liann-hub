// 3D comic book for the reader (three.js r128, vendor/three-r128, loaded only when the reader asks for it).
//
// The book is a stack of leaves. Leaf j has page 2j on its front and page 2j+1 on its back, so the cover (page 0) sits alone
// on the right, and spread s shows the back of leaf s-1 on the left and the front of leaf s on the right: the same pairing
// as spreadsOf() in comics.js. A leaf that is turning is a strip of 40 segments whose bend is recomputed each frame: the strip
// keeps its length and its tangent angle falls along it, so the sheet curls like paper and lands flat on the other side.
// Light and a shadow map shade the curl and cast the shadow of the lifted page.
//
// Pages are WebGL textures, so the page image host must allow cross-site loading (CORS) for the hub's address; if it does not,
// createBook() rejects and the reader stays on its flat two-page view.
/* global THREE */
import { clampPage, spreadsOf } from './comics.js'

const SEG = 40, EPS = 0.012, BASE = 0.03, DUR = 950, KMAX = 1.7, LENS = 200, LENS_ZOOM = 2.6
const srgb = hex => new THREE.Color(hex).convertSRGBToLinear()
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function loadThree() {
  if (window.THREE) return Promise.resolve()
  return new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = 'vendor/three-r128/three.min.js'
    s.onload = ok; s.onerror = () => no(new Error('three.js did not load')); document.head.append(s)
  })
}

let webgl
export function webglOK() {
  if (webgl === undefined) { try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { webgl = false } }
  return webgl
}

function probe(src) {
  return new Promise((ok, no) => {
    const im = new Image(); im.crossOrigin = 'anonymous'
    im.onload = () => ok(im); im.onerror = () => no(new Error('page image blocked (cross-site loading)')); im.src = src
  })
}

// Build the book. opts: { pages: [url], alts: [text], onSettled(spread) }.
export async function createBook(opts) {
  await loadThree()
  const first = await probe(opts.pages[0])
  const T = window.THREE, n = opts.pages.length, leaves = Math.ceil(n / 2), spreadCount = spreadsOf(n).length // the same pairing as the flat reader
  const ratio = Math.min(Math.max(first.naturalWidth / first.naturalHeight, 0.5), 1.25)
  const h = 1.5, w = h * ratio, ds = w / SEG
  const zR = j => BASE + EPS * (leaves - j), zL = j => BASE + EPS * (j + 1)

  const host = document.createElement('div'); host.className = 'book3d'
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setClearColor(0x000000, 0); renderer.outputEncoding = T.sRGBEncoding
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap
  host.append(renderer.domElement)
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(28, 1, 0.1, 50)
  scene.add(new T.AmbientLight(0xffffff, 0.62))
  const sun = new T.DirectionalLight(0xffffff, 0.46); sun.position.set(-1.6, 1.2, 4.2); sun.castShadow = true
  const sc = sun.shadow.camera; sc.left = -w * 1.7; sc.right = w * 1.7; sc.top = h; sc.bottom = -h; sc.near = 0.5; sc.far = 12
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.012; sun.shadow.radius = 5
  scene.add(sun)

  // cover board, two page blocks, and the surface that catches the shadow
  const paper = 0xf1e9d8
  const boardMat = new T.MeshLambertMaterial({ color: srgb(0x2a231d) })
  const boardFor = x => { const m = new T.Mesh(new T.BoxGeometry(w + 0.06, h + 0.1, BASE), boardMat); m.position.set(x, 0, BASE / 2); m.receiveShadow = true; scene.add(m); return m }
  const boardL = boardFor(-w / 2 - 0.03), boardR = boardFor(w / 2 + 0.03)
  const block = x => { const m = new T.Mesh(new T.BoxGeometry(w, h, 1), new T.MeshLambertMaterial({ color: srgb(0xe2d8c3) })); m.position.x = x; m.receiveShadow = true; scene.add(m); return m }
  const blockL = block(-w / 2), blockR = block(w / 2)
  const ground = new T.Mesh(new T.PlaneGeometry(14, 10), new T.ShadowMaterial({ opacity: 0.38 })); ground.position.z = -0.001; ground.receiveShadow = true; scene.add(ground)

  // textures: only the leaves near the open spread stay in memory
  const loader = new T.TextureLoader(); loader.setCrossOrigin('anonymous')
  const texs = new Map(); let failed = false
  const getTex = (p, back) => {
    if (p >= n) return null
    const key = p + (back ? 'b' : 'f')
    if (!texs.has(key)) {
      const t = loader.load(opts.pages[p], () => { invalidate(); refreshLens() }, undefined, () => { failed = true; opts.onFail && opts.onFail() })
      t.encoding = T.sRGBEncoding; t.anisotropy = 4
      if (back) { t.wrapS = T.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1 }
      texs.set(key, t)
    }
    return texs.get(key)
  }
  const keep = s => { // leaves within 2 of the open spread
    const want = new Set()
    for (let j = Math.max(0, s - 3); j <= Math.min(leaves - 1, s + 2); j++) { want.add(2 * j + 'f'); want.add(2 * j + 1 + 'b') }
    for (const [k, t] of texs) if (!want.has(k)) { t.dispose(); texs.delete(k) }
    for (const L of L_) { L.front.material.map = want.has(2 * L.j + 'f') ? getTex(2 * L.j, false) : null; L.back.material.map = want.has(2 * L.j + 1 + 'b') ? getTex(2 * L.j + 1, true) : null
      for (const m of [L.front.material, L.back.material]) { m.color.copy(m.map ? new T.Color(0xffffff) : srgb(paper)); m.needsUpdate = true } }
  }

  const L_ = []
  for (let j = 0; j < leaves; j++) {
    const geo = new T.PlaneGeometry(w, h, SEG, 1)
    const mk = side => new T.MeshLambertMaterial({ color: srgb(paper), side })
    const front = new T.Mesh(geo, mk(T.FrontSide)), back = new T.Mesh(geo, mk(T.BackSide))
    for (const m of [front, back]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m) }
    L_.push({ j, geo, front, back, t: 0, from: 0, to: 0, start: 0, delay: 0 })
  }

  function layout(L) {
    const t = L.t, th = Math.PI * t
    const K = KMAX * Math.sin(Math.PI * t) * (0.7 - t) / w   // curvature, rad per unit length: lags early, leads late, flat at both ends
    const z0 = zR(L.j) + (zL(L.j) - zR(L.j)) * t + 0.03 * Math.sin(Math.PI * t)
    const pos = L.geo.attributes.position
    let x = 0, z = z0
    for (let i = 0; i <= SEG; i++) {
      if (i > 0) { const psi = th - K * ((i - 0.5) * ds); x += ds * Math.cos(psi); z += ds * Math.sin(psi) }
      pos.setXYZ(i, x, h / 2, z); pos.setXYZ(SEG + 1 + i, x, -h / 2, z)
    }
    pos.needsUpdate = true; L.geo.computeVertexNormals()
    L.geo.computeBoundingSphere() // the raycaster (the brass magnifier) rejects hits outside the bounds, so they must follow the turned page
  }
  function blocks() { // each block stays just under the top page that is actually resting on its side
    let right = 0, left = 0
    for (const L of L_) { if (L.t < 0.02) right++; if (L.t > 0.98) left++ }
    const set = (m, count, x) => { const th = Math.max(BASE, BASE + EPS * count - 0.005); m.scale.z = th; m.position.set(x, 0, th / 2) }
    set(blockR, right, w / 2); set(blockL, left, -w / 2)
    blockR.visible = boardR.visible = right > 0; blockL.visible = boardL.visible = left > 0
  }

  let spread = 0, raf = 0, camX = 0, camDist = 1
  function placeCamera() { camera.position.set(camX, -camDist * 0.22, camDist * 0.975); camera.up.set(0, 1, 0); camera.lookAt(camX, 0, 0); camera.updateMatrixWorld() }
  function fit() {
    const W = host.clientWidth, H = host.clientHeight; if (!W || !H) return false
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(W, H, false)
    camera.aspect = W / H; camera.updateProjectionMatrix()
    const tv = Math.tan((camera.fov * Math.PI) / 360)
    const d = Math.max((w * 1.12) / (tv * camera.aspect), (h * 1.3) / (2 * tv))
    camDist = d; placeCamera()
    return true
  }
  function tick(now) {
    let busy = false
    for (const L of L_) {
      if (L.t !== L.to) {
        const k = Math.min(Math.max((now - L.start - L.delay) / DUR, 0), 1)
        L.t = L.from + (L.to - L.from) * ease(k); if (k >= 1) L.t = L.to
        layout(L); busy = busy || L.t !== L.to
      }
    }
    // the book centres itself on the cover, and on the last page when only the left page is left
    const goal = spread === 0 ? w / 2 : spread === spreadCount - 1 && 2 * spread >= n ? -w / 2 : 0
    if (Math.abs(goal - camX) > 0.002) { camX += (goal - camX) * 0.14; busy = true } else camX = goal
    placeCamera(); blocks(); renderer.render(scene, camera)
    raf = busy ? requestAnimationFrame(tick) : 0
    if (!busy) { refreshLens(); opts.onSettled && opts.onSettled(spread) }
  }
  const invalidate = () => { if (!raf) raf = requestAnimationFrame(tick) }

  function goTo(s, animate = true) {
    s = clampPage(s, spreadCount)
    spread = s; keep(s)
    const now = performance.now(); let moved = 0
    for (const L of L_) {
      const to = L.j < s ? 1 : 0
      if (to !== L.to) { L.from = L.t; L.to = to; L.start = now; L.delay = animate ? Math.min(moved++, 5) * 90 : 0; if (!animate) { L.t = to; layout(L) } }
    }
    invalidate()
  }

  // draggable brass magnifier: shows the page under its centre, enlarged
  const lens = document.createElement('div'); lens.className = 'brass'; lens.hidden = true
  lens.innerHTML = '<div class="bglass"></div><div class="brim"></div><div class="bgrip"></div>'
  host.append(lens)
  let lx = 0.72, ly = 0.7 // centre as a fraction of the stage
  const glass = lens.firstChild
  function placeLens() { lens.style.left = lx * host.clientWidth - LENS / 2 + 'px'; lens.style.top = ly * host.clientHeight - LENS / 2 + 'px' }
  function refreshLens() {
    if (lens.hidden) return
    placeLens()
    glass.style.backgroundImage = 'none'
    if (raf) return
    const W = host.clientWidth, H = host.clientHeight; if (!W) return
    const ndc = new T.Vector2(lx * 2 - 1, -(ly * 2 - 1))
    const rc = new T.Raycaster(); rc.setFromCamera(ndc, camera)
    const side = []
    if (spread > 0) side.push([L_[spread - 1].back, true, spread * 2 - 1])
    if (spread < leaves && spread * 2 < n) side.push([L_[spread].front, false, spread * 2])
    for (const [mesh, back, page] of side) {
      if (page >= n) continue
      const hit = rc.intersectObject(mesh)[0]; if (!hit) continue
      const proj = v => { const p = v.clone().project(camera); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H] }
      const x0 = back ? -w : 0, z = hit.point.z
      const [ax, ay] = proj(new T.Vector3(x0, h / 2, z)), [bx, by] = proj(new T.Vector3(x0 + w, h / 2, z)), [, cy] = proj(new T.Vector3(x0, -h / 2, z))
      const pw = Math.hypot(bx - ax, by - ay), ph = Math.abs(cy - ay)
      const u = back ? 1 - hit.uv.x : hit.uv.x, v = hit.uv.y
      glass.style.backgroundImage = `url("${opts.pages[page]}")`
      glass.style.backgroundSize = `${pw * LENS_ZOOM}px ${ph * LENS_ZOOM}px`
      glass.style.backgroundPosition = `${LENS / 2 - u * pw * LENS_ZOOM}px ${LENS / 2 - (1 - v) * ph * LENS_ZOOM}px`
      return
    }
  }
  let drag = null
  lens.addEventListener('pointerdown', e => {
    const r = host.getBoundingClientRect()
    drag = { ox: e.clientX - (r.left + lx * r.width), oy: e.clientY - (r.top + ly * r.height) } // keep the grab point under the pointer
    lens.setPointerCapture(e.pointerId); e.preventDefault()
  })
  lens.addEventListener('pointermove', e => {
    if (!drag) return
    const r = host.getBoundingClientRect()
    lx = Math.min(Math.max((e.clientX - r.left - drag.ox) / r.width, 0.02), 0.98)
    ly = Math.min(Math.max((e.clientY - r.top - drag.oy) / r.height, 0.02), 0.98)
    refreshLens()
  })
  const drop = () => { drag = null }
  lens.addEventListener('pointerup', drop); lens.addEventListener('pointercancel', drop)

  const ro = new ResizeObserver(() => { if (fit()) { invalidate(); refreshLens() } }); ro.observe(host)
  fit(); for (const L of L_) layout(L)

  return {
    el: host, leaves, spreads: spreadCount,
    get spread() { return spread }, get failed() { return failed },
    goTo, step: d => goTo(spread + d),
    // seek(): freeze one leaf part-way through its turn (tests and screenshots)
    seek(j, t) { const L = L_[j]; L.t = L.to = t; layout(L); blocks(); renderer.render(scene, camera) }, resize() { if (fit()) invalidate() },
    setLens(on) { lens.hidden = !on; if (on) { placeLens(); invalidate() } },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); for (const t of texs.values()) t.dispose(); for (const L of L_) L.geo.dispose(); renderer.dispose(); host.remove() },
  }
}
