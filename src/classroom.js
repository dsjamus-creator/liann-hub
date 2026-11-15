import { config } from './config.js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function classroomSurface(s){
 const room=s.classroomRoom
 if(!room)return ''
 return `<section class="c hub-room-controls"><div><p class="hsk-eyebrow">${esc(room.student||room.tutor||'Lesson')}</p><h2>${esc(room.topic||'Your classroom')}</h2></div><p role="status">${room.status==='ready'?'Classroom open. Video and board controls are inside the room.':room.status==='blocked'?'Embedded sign-in has not completed. You can open the full classroom in a separate tab.':'Opening your secure classroom…'}</p>${room.error?`<p class="err" role="alert">${esc(room.error)}</p>`:''}<div class="workspace-actions"><button class="btn ghost" id="classroom-fullscreen">Expand classroom</button><button class="btn ghost" id="classroom-move-tab">Move to separate tab</button><button class="btn ghost" id="classroom-close">Leave classroom</button></div></section><div id="classroom-frame-slot" class="classroom-frame-slot" aria-label="Embedded lesson room"></div>`
}

// The live frame is a body-level portal. Rebuilding the hub or changing tabs
// cannot detach it and terminate the WebRTC call, even without DOM moveBefore.
export function createClassroomController({state,account,render,navigate}){
 const backendOrigin=new URL(config.backend).origin
 let frame=null,host=null,returnBar=null,deadline=null,generation=0,owner=null
 function validOwner(){return owner&&state.user===owner.user&&state.workspaceRole===owner.role&&!state.learner&&!state.institutional&&['tutor','student'].includes(state.workspaceRole)&&!state.admin?.superAdmin}
 function close(){
  generation++;clearTimeout(deadline);host?.remove();returnBar?.remove();frame=null;host=null;returnBar=null;state.classroomRoom=null;owner=null
 }
 function position(){
  if(!host)return
  const slot=document.getElementById('classroom-frame-slot'),main=document.getElementById('main')
  const visible=validOwner()&&state.view==='hub'&&state.page==='workspace'&&state.workspaceSection==='classroom'&&slot
  host.hidden=!visible
  if(returnBar)returnBar.hidden=!validOwner()||!!visible
  if(!visible)return
  const r=slot.getBoundingClientRect(),m=main.getBoundingClientRect(),top=Math.max(r.top,m.top,0),bottom=Math.min(r.bottom,m.bottom,innerHeight)
  Object.assign(host.style,{left:r.left+'px',top:top+'px',width:r.width+'px',height:Math.max(0,bottom-top)+'px'})
  host.hidden=bottom<=top
 }
 function sync(){
  if(host&&!validOwner()){close();return}
  if(returnBar&&state.classroomRoom)returnBar.querySelector('span').textContent=state.classroomRoom.topic||'Classroom open'
  position()
  if(frame&&state.classroomRoom?.status==='ready')frame.contentWindow?.postMessage({type:'liann-classroom:theme',lessonId:state.classroomRoom.id,channel:state.classroomRoom.channel,theme:state.theme},backendOrigin)
 }
 async function open(lesson){
  if(!lesson||!UUID.test(lesson.id)||!state.user||state.learner||state.institutional||!['tutor','student'].includes(state.workspaceRole))return
  if(state.classroomRoom?.id===lesson.id){navigate('classroom');position();return}
  if(state.classroomRoom&&!confirm('Leave the current classroom and open this lesson?'))return
  close();const request=generation,user=state.user,role=state.workspaceRole,channel=crypto.randomUUID()
  owner={user,role};state.classroomRoom={...lesson,channel,status:'opening',error:''};navigate('classroom');render()
  try{
   const url=await account.workspaceLink('/classroom/?lesson='+lesson.id+'&hub=1&channel='+channel)
   if(request!==generation||!validOwner())return
   const target=new URL(url)
   if(target.origin!==backendOrigin||target.pathname!=='/auth/liann/continue')throw Error('The classroom returned an unexpected sign-in address.')
   host=document.createElement('div');host.className='classroom-portal';host.setAttribute('aria-label','Live classroom')
   frame=document.createElement('iframe');frame.id='hub-classroom-frame';frame.title='AlongSide classroom';frame.allow='camera; microphone; display-capture; fullscreen';frame.allowFullscreen=true
   frame.referrerPolicy='no-referrer';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-presentation')
   host.append(frame);document.body.append(host);frame.src=target.href
   returnBar=document.createElement('div');returnBar.className='classroom-return';const label=document.createElement('span'),button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Return to classroom';button.onclick=()=>{navigate('classroom');position()};returnBar.append(label,button);document.body.append(returnBar)
   deadline=setTimeout(()=>{if(request===generation&&validOwner()&&state.classroomRoom?.status==='opening'){state.classroomRoom.status='blocked';render()}},12000)
   sync()
  }catch(error){if(request!==generation||!validOwner())return;state.classroomRoom.status='blocked';state.classroomRoom.error=error.message;render()}
 }
 async function moveToTab(){
  const room=state.classroomRoom;if(!room||!validOwner())return
  const tab=window.open('','_blank');if(!tab){room.error='Allow a new tab to open the full classroom.';return render()}
  tab.opener=null;const request=generation
  try{const target=await account.workspaceLink('/classroom/?lesson='+room.id);if(request!==generation||!validOwner()){tab.close();return}close();tab.location.href=target;render()}
  catch(error){tab.close();if(request===generation&&validOwner()){room.error=error.message;render()}}
 }
 window.addEventListener('message',event=>{
  const room=state.classroomRoom,data=event.data
  if(!frame||!room||!validOwner()||event.source!==frame.contentWindow||event.origin!==backendOrigin||!data||data.lessonId!==room.id||data.channel!==room.channel)return
  if(data.type==='liann-classroom:ready'){clearTimeout(deadline);room.status='ready';room.error='';render()}
  if(data.type==='liann-classroom:unavailable'){clearTimeout(deadline);room.status='blocked';room.error='The room could not confirm your lesson access. Try the separate-tab option.';render()}
  if(data.type==='liann-classroom:leave'&&confirm('Leave this classroom?')){close();render()}
 })
 window.addEventListener('resize',position);document.addEventListener('scroll',position,true)
 window.addEventListener('beforeunload',event=>{if(frame&&validOwner()){event.preventDefault();event.returnValue=''}})
 function bind(){
  document.querySelectorAll('[data-classroom-open]').forEach(button=>{button.onclick=()=>{
   const id=button.dataset.classroomOpen,data=state.workspaceData?.data||{},lesson=[...(data.upcoming||[]),...(data.past||[]),...(state.hsk?.lessons||[])].find(l=>l.id===id)
   if(lesson)open(lesson);else if(state.hsk?.detail?.lesson?.id===id)open(state.hsk.detail.lesson)
  }})
  const closeButton=document.getElementById('classroom-close');if(closeButton)closeButton.onclick=()=>{if(confirm('Leave this classroom?')){close();render()}}
  const full=document.getElementById('classroom-fullscreen');if(full)full.onclick=()=>{if(host?.requestFullscreen)host.requestFullscreen().catch(()=>{state.classroomRoom.error='Full-screen mode is not available in this browser.';render()})}
  const separate=document.getElementById('classroom-move-tab');if(separate)separate.onclick=moveToTab
 }
 return {open,close,sync,bind}
}
