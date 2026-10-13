// The Figures page's 3D viewer, from the approved hub design. three.js (r128, MIT, vendor/three-r128) loads only when the page opens; it is served from the hub so the CSP stays 'self'.
/* global THREE */
import { CHARS } from './views.js'

let V = null
function loadThree(cb){if(window.THREE)return cb();const sc=document.createElement("script");sc.src="vendor/three-r128/three.min.js";sc.onload=cb;sc.onerror=()=>{const l=document.querySelector('.fig3d .load');if(l)l.textContent='3D viewer could not load. Check your connection.'};document.head.appendChild(sc)}
function canvasTex(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.anisotropy=4;return t}
function mat(c,o){return new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.75,metalness:0},o||{}))}
function buildBella(){const g=new THREE.Group(),fur=mat(0xF6F2EA,{roughness:.95}),dark=mat(0x1A1714,{roughness:.4});
 const add=(geo,m,x,y,z,sx,sy,sz)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);if(sx)o.scale.set(sx,sy,sz);g.add(o);return o};
 const sph=new THREE.SphereGeometry(1,32,24);
 add(sph,fur,0,.95,0,.78,.72,.95);                 // body
 [[-.42,.38,.45],[.42,.38,.45],[-.42,.38,-.45],[.42,.38,-.45]].forEach(([x,y,z])=>add(sph,fur,x,y,z,.22,.3,.22)); // legs
 add(sph,fur,0,1.78,.28,.62,.58,.6);               // head
 for(let i=0;i<14;i++){const a=i/14*Math.PI*2;add(sph,fur,Math.cos(a)*.5,1.95+Math.sin(a*2)*.08,.2+Math.sin(a)*.42,.2,.2,.2)} // fluffy crown
 add(sph,fur,-.62,1.62,.2,.18,.38,.26);add(sph,fur,.62,1.62,.2,.18,.38,.26); // ears
 add(sph,fur,0,1.62,.78,.26,.2,.26);               // muzzle
 add(sph,dark,0,1.7,1.02,.09,.07,.07);             // nose
 add(sph,dark,-.22,1.86,.78,.07,.08,.05);add(sph,dark,.22,1.86,.78,.07,.08,.05); // eyes
 const collar=new THREE.Mesh(new THREE.TorusGeometry(.48,.06,12,40),mat(0x5A3B2A));collar.position.set(0,1.32,.18);collar.rotation.x=Math.PI/2.3;g.add(collar);
 const tagTex=canvasTex(256,256,(x,w,h)=>{x.fillStyle='#C9C3B8';x.beginPath();x.arc(128,128,124,0,7);x.fill();x.fillStyle='#2B2B28';x.font='bold 96px "Noto Sans SC",sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('贝拉',128,132)});
 const tag=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.03,32),[mat(0xB8B2A6,{metalness:.6,roughness:.3}),mat(0xFFFFFF,{map:tagTex,metalness:.3,roughness:.4}),mat(0xB8B2A6)]);tag.rotation.x=Math.PI/2;tag.position.set(0,1.12,.74);g.add(tag);
 const pack=new THREE.Mesh(new THREE.BoxGeometry(.9,.8,.45),mat(0x5B6B4A));pack.position.set(0,1.05,-.82);g.add(pack);
 [-.3,.3].forEach(x=>{const st=new THREE.Mesh(new THREE.BoxGeometry(.1,.95,.08),mat(0x4A3A2C));st.position.set(x,1.1,.4);st.rotation.x=-.25;g.add(st)});
 return g}
function buildMaquette(c){const g=new THREE.Group(),m=mat(c.col,{roughness:.6}),a=mat(c.acc);
 const body=new THREE.Mesh(new THREE.CylinderGeometry(.42,.62,1.5,32),m);body.position.y=1;g.add(body);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.5,32,24),m);head.position.y=2.1;g.add(head);
 const scarf=new THREE.Mesh(new THREE.TorusGeometry(.42,.09,12,40),a);scarf.position.y=1.72;scarf.rotation.x=Math.PI/2;g.add(scarf);
 const q=canvasTex(256,256,(x)=>{x.fillStyle='rgba(0,0,0,0)';x.fillRect(0,0,256,256);x.fillStyle='#FFFFFF';x.font='bold 150px Georgia,serif';x.textAlign='center';x.textBaseline='middle';x.fillText('?',128,140)});
 const face=new THREE.Mesh(new THREE.PlaneGeometry(.6,.6),new THREE.MeshBasicMaterial({map:q,transparent:true}));face.position.set(0,2.1,.51);g.add(face);
 return g}
function buildBase(){const b=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.25,.22,48),mat(0xFDEFCB,{roughness:.5}));b.position.y=.11;const rim=new THREE.Mesh(new THREE.TorusGeometry(1.2,.03,8,64),mat(0xC24837));rim.rotation.x=Math.PI/2;rim.position.y=.22;const g=new THREE.Group();g.add(b,rim);return g}
function buildFigure(c){const g=new THREE.Group();g.add(buildBase());const f=c.real?buildBella():buildMaquette(c);f.position.y=.22;g.add(f);return g}
function buildBox(c){const g=new THREE.Group(),W=3.1,H=4.6,D=2.2;
 const header=canvasTex(1024,512,(x,w,h)=>{x.fillStyle='#121410';x.fillRect(0,0,w,h);x.font='900 74px Nunito,sans-serif';x.textAlign='center';x.fillStyle='#91A584';x.fillText('Learning with',w/2-100,140);x.fillStyle='#EF725D';x.fillText('LiANN',w/2+250,140);x.fillStyle='#F8F1E5';x.font='700 120px Georgia,serif';x.fillText(c.n,w/2,320);x.fillStyle='#E8AE46';x.font='700 84px "Noto Sans SC",sans-serif';x.fillText((c.hz?c.hz+'  ':'')+(c.py||''),w/2,440)});
 const backTex=new THREE.TextureLoader().load(c.id==='bella'?'assets/comic-1.jpg':'assets/comic-2.jpg');
 const side=canvasTex(512,1024,(x,w,h)=>{x.fillStyle='#DE5A4F';x.fillRect(0,0,w,h);x.fillStyle='#FDEFCB';x.fillRect(0,h*.7,w,h*.3);x.save();x.translate(w/2,h*.35);x.rotate(-Math.PI/2);x.fillStyle='#FFFFFF';x.font='900 96px Nunito,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(c.n,0,0);x.restore();x.fillStyle='#3D3C34';x.font='700 120px "Noto Sans SC",sans-serif';x.textAlign='center';x.fillText(c.hz||'?',w/2,h*.88)});
 const card=mat(0xFFFFFF,{roughness:.6});
 const back=new THREE.Mesh(new THREE.PlaneGeometry(W,H),mat(0xFFFFFF,{map:backTex,roughness:.7}));back.position.set(0,H/2,-D/2);g.add(back);
 const back2=new THREE.Mesh(new THREE.PlaneGeometry(W,H),mat(0x2A231C));back2.position.set(0,H/2,-D/2-.01);back2.rotation.y=Math.PI;g.add(back2);
 [-1,1].forEach(sg=>{const sd=new THREE.Mesh(new THREE.PlaneGeometry(D,H),mat(0xFFFFFF,{map:side}));sd.position.set(sg*W/2,H/2,0);sd.rotation.y=sg*Math.PI/2;g.add(sd);const sdi=sd.clone();sdi.material=mat(0x2A231C);sdi.rotation.y=-sg*Math.PI/2;sdi.position.x=sg*(W/2-.01);g.add(sdi)});
 const top=new THREE.Mesh(new THREE.BoxGeometry(W+.04,1.1,D+.04),[mat(0xDE5A4F),mat(0xDE5A4F),mat(0x121410),mat(0x121410),mat(0xFFFFFF,{map:header}),mat(0x121410)]);top.position.set(0,H+.55,0);g.add(top);
 const hang=new THREE.Mesh(new THREE.TorusGeometry(.22,.05,8,32,Math.PI),mat(0x121410));hang.position.set(0,H+1.1,0);g.add(hang);
 const floor=new THREE.Mesh(new THREE.BoxGeometry(W,.12,D),mat(0xFDEFCB));floor.position.set(0,.06,0);g.add(floor);
 const fr=mat(0xDE5A4F,{roughness:.55});[[0,.25,W,.5],[0,H-.15,W,.3]].forEach(([x,y,w,h])=>{const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,.04),fr);b.position.set(x,y,D/2);g.add(b)});
 [-1,1].forEach(sg=>{const b=new THREE.Mesh(new THREE.BoxGeometry(.28,H,.04),fr);b.position.set(sg*(W/2-.14),H/2,D/2);g.add(b)});
 const win=new THREE.Mesh(new THREE.PlaneGeometry(W-.56,H-.8),new THREE.MeshPhysicalMaterial({color:0xFFFFFF,transparent:true,opacity:.12,roughness:.05,metalness:0,clearcoat:1,side:THREE.DoubleSide}));win.position.set(0,.5+(H-.8)/2,D/2+.005);g.add(win);
 const fig=buildFigure(c);fig.scale.setScalar(.82);fig.position.set(0,.12,-.1);g.add(fig);
 return g}
export function stopViewer() { if (V) { V.stop(); V = null } }
export function mountViewer(S) {
 const el = document.getElementById('fig3d'); if (!el) return; stopViewer()
 loadThree(() => { if (document.getElementById('fig3d') !== el) return
  try { draw(el, S) } catch { el.innerHTML = '<div class="load">This device can’t show the 3D view.</div>' } })
}
function draw(el, S) { const c = CHARS.find(x => x.id === S.fig) || CHARS[0]; const mode = S.figmode || 'figure'
  el.querySelector('.load')?.remove();
  const r=new THREE.WebGLRenderer({antialias:true,alpha:true});r.setPixelRatio(Math.min(2,devicePixelRatio));r.outputEncoding=THREE.sRGBEncoding;el.prepend(r.domElement);
  const sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(35,1,.1,100);
  sc.add(new THREE.HemisphereLight(0xFFF7DF,0x2A231C,.85));const k=new THREE.DirectionalLight(0xFFFFFF,1.1);k.position.set(3,6,5);sc.add(k);const rim=new THREE.DirectionalLight(0xEF725D,.5);rim.position.set(-4,3,-4);sc.add(rim);
  let obj;if(mode==='lineup'){obj=new THREE.Group();CHARS.forEach((ch,i)=>{const b=buildBox(ch);b.position.x=(i-1.5)*3.6;obj.add(b)})}else obj=mode==='box'?buildBox(c):buildFigure(c);
  sc.add(obj);const box=new THREE.Box3().setFromObject(obj),ctr=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());obj.position.sub(ctr);
  let dist=Math.max(size.x*1.15,size.y)*1.9,ry=mode==='lineup'?0:-.5,rx=.08,drag=null,auto=!matchMedia('(prefers-reduced-motion: reduce)').matches&&mode!=='lineup',run=true;
  const fit=()=>{const w=el.clientWidth,h=el.clientHeight;r.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()};fit();
  const ro=new ResizeObserver(fit);ro.observe(el);
  el.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY};auto=false;el.setPointerCapture(e.pointerId)};
  el.onpointermove=e=>{if(!drag)return;ry+=(e.clientX-drag.x)*.01;rx=Math.max(-.6,Math.min(.8,rx+(e.clientY-drag.y)*.006));drag={x:e.clientX,y:e.clientY}};
  el.onpointerup=()=>drag=null;
  el.onwheel=e=>{e.preventDefault();dist=Math.max(size.y*.8,Math.min(size.y*6,dist*(1+Math.sign(e.deltaY)*.08)))};
  const tick=()=>{if(!run)return;if(auto)ry+=.006;obj.rotation.set(rx,ry,0);cam.position.set(0,size.y*.05,dist);cam.lookAt(0,0,0);r.render(sc,cam);requestAnimationFrame(tick)};tick();
  V={stop(){run=false;ro.disconnect();r.dispose()}}}
