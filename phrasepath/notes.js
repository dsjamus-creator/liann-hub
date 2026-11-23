import { config } from '/src/config.js'
import { createAccount } from '/src/account.js'

const account = createAccount({ pinyinApi: config.pinyinApi, backend: config.backend })
const api = new URL('/api/phrasepath', config.backend).href.replace(/\/$/, '')
const $ = s => document.querySelector(s)
let notes = [], folder = '*', editingId = null, currentEmail = '', driveConfig = null, driveFolder = null, drivePickerPromise = null, driveAccessToken = '', driveTokenExpiresAt = 0
const say = text => { $('#importStatus').textContent = text }
const authSay = text => { $('#authStatus').textContent = text }
const ext = file => (file.name.split('.').pop() || '').toLowerCase()
const titleOf = file => file.name.replace(/\.[^.]+$/, '')
const pathOf = file => { const p = file.phrasePathRelativePath || file.webkitRelativePath || ''; return p.includes('/') ? p.split('/').slice(0, -1).join('/') : '' }
const hiddenPath = path => path.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.'))
const mimeFor = name => {
  const e = (name.split('.').pop() || '').toLowerCase()
  return ({txt:'text/plain',md:'text/markdown',markdown:'text/markdown',html:'text/html',htm:'text/html',csv:'text/csv',json:'application/json',pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',sdocx:'application/zip',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',mid:'audio/midi',midi:'audio/midi',musicxml:'application/vnd.recordare.musicxml+xml',mxl:'application/vnd.recordare.musicxml'})[e] || 'application/octet-stream'
}

async function request(path, options = {}) {
  const token = await account.accessToken()
  if (!token) throw Object.assign(new Error('Sign in again to sync your notes.'), { status: 401 })
  const headers = new Headers(options.headers || {})
  headers.set('Authorization', 'Bearer ' + token)
  if (typeof options.body === 'string') headers.set('Content-Type', 'application/json')
  let response
  try {
    response = await fetch(api + path, { cache:'no-store', referrerPolicy:'no-referrer', mode:'cors', credentials:'omit', ...options, headers })
  } catch {
    throw new Error('Could not reach the PhrasePath notes service. Check your connection and try again.')
  }
  let data = {}
  try { data = await response.json() } catch {}
  if (!response.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status:response.status, data })
  return data
}

async function unzip(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = Math.max(0, bytes.length - 65557); i <= bytes.length - 22; i++) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('This ZIP file is incomplete or unsupported.')
  const count = view.getUint16(eocd + 10, true), centralOffset = view.getUint32(eocd + 16, true)
  if (count > 1000) throw new Error('This ZIP contains more than 1,000 files. Split it into smaller batches.')
  const decoder = new TextDecoder('utf-8'), out = []
  let at = centralOffset, total = 0
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new Error('This ZIP has an invalid file index.')
    const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true)
    const packed = view.getUint32(at + 20, true), size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true), extraLength = view.getUint16(at + 30, true), commentLength = view.getUint16(at + 32, true)
    const localAt = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.slice(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/') || hiddenPath(name)) continue
    if (flags & 1) throw new Error('Password-protected ZIPs are not supported.')
    if (size > 50 * 1024 * 1024 || packed > 50 * 1024 * 1024) throw new Error(name + ' exceeds the 50 MB per-file limit.')
    total += size
    if (total > 500 * 1024 * 1024) throw new Error('This ZIP expands beyond the 500 MB import limit.')
    if (localAt + 30 > bytes.length || view.getUint32(localAt, true) !== 0x04034b50) throw new Error('This ZIP contains an invalid file.')
    const localNameLength = view.getUint16(localAt + 26, true), localExtraLength = view.getUint16(localAt + 28, true)
    const dataAt = localAt + 30 + localNameLength + localExtraLength
    const compressed = bytes.slice(dataAt, dataAt + packed)
    let content
    if (method === 0) content = compressed
    else if (method === 8) {
      if (!('DecompressionStream' in window)) throw new Error('ZIP extraction needs a newer browser. You can select the exported files directly.')
      try { content = new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) }
      catch { throw new Error('A file in this ZIP could not be extracted. Try selecting the folder or files directly.') }
    } else throw new Error('This ZIP uses a compression format this browser cannot extract.')
    if (content.byteLength !== size) throw new Error('A file in this ZIP did not extract completely.')
    const nameOnly = name.split('/').pop()
    const nested = new File([content], nameOnly, { type:mimeFor(nameOnly), lastModified:file.lastModified || Date.now() })
    nested.phrasePathRelativePath = name
    out.push(nested)
  }
  return out
}

function parseSamsung(bytes){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decode=new TextDecoder('utf-16le',{ignoreBOM:true}),u16=a=>view.getUint16(a,true),u32=a=>view.getUint32(a,true);const object=(data,ver)=>{const v=new DataView(data.buffer,data.byteOffset,data.byteLength),a16=a=>a+2<=data.length?v.getUint16(a,true):-1,a32=a=>a+4<=data.length?v.getUint32(a,true):-1,base=a32(0);if(base<6||a16(4)!==0)return'';const b=base,bs=a32(b);if(bs<6||a16(b+4)!==6)return'';const sh=b+bs;if(a16(sh+4)!==7)return'';const own=a32(sh+6),mask=a32(sh+13);if(own<0||mask<0||!(mask&1))return'';const at=sh+own,size=a32(at);if(size<0||at+4+size>data.length)return'';const d=new DataView(data.buffer,data.byteOffset+at+4,size);let p=0;const r32=()=>{if(p+4>size)throw Error('Incomplete Samsung Notes text');const n=d.getUint32(p,true);p+=4;return n},r16=()=>{if(p+2>size)throw Error('Incomplete Samsung Notes text');const n=d.getUint16(p,true);p+=2;return n};const units=r32();if(p+units*2>size)throw Error('Invalid Samsung Notes text length');const text=decode.decode(new Uint8Array(data.buffer,data.byteOffset+at+4+p,units*2));p+=units*2;for(let i=0,n=r32();i<n;i++){const s=r16();if(p+s>size)throw Error('Invalid text span');p+=s}for(let i=0,n=r32();i<n;i++){const s=r16();if(p+s>size)throw Error('Invalid paragraph');p+=s}p+=17;const sections=r16();p+=sections*8;if(ver>=2035){const flags=r32();r32();if(flags&1)for(let i=0,n=r32();i<n;i++){const s=r32();if(p+s>size)throw Error('Invalid object span');p+=s}}if(p!==size)throw Error('Unsupported Samsung Notes version');return text.replace(/\uFFFC/g,'').trim()};if(bytes.length<64)throw Error('Samsung Notes export is incomplete');let p=14,ver=u32(p);p+=4;const tn=u16(p);p+=2;if(tn!==65535)p+=tn*2;p+=4+8+8+20;const ts=u32(p);p+=4;if(p+ts+4>bytes.length)throw Error('Samsung Notes title is incomplete');const title=object(new Uint8Array(bytes.buffer,bytes.byteOffset+p,ts),ver);p+=ts;const bs=u32(p);p+=4;if(p+bs>bytes.length)throw Error('Samsung Notes content is incomplete');const body=object(new Uint8Array(bytes.buffer,bytes.byteOffset+p,bs),ver);return{title,body}}


async function decodeSdocx(file) {
  const entries = await unzip(file)
  const note = entries.find(x => x.name === 'note.note' || x.phrasePathRelativePath?.split('/').pop() === 'note.note')
  if (!note) throw new Error('No Samsung note data found.')
  const parsed = parseSamsung(new Uint8Array(await note.arrayBuffer()))
  return { title:parsed.title || titleOf(file), body:parsed.body || 'Original Samsung Notes file attached; no typed text was available to preview.' }
}

async function readText(file) {
  const e = ext(file)
  if (e === 'sdocx') return (await decodeSdocx(file)).body
  if (['txt','md','markdown','html','htm','lrc','srt','vtt','csv','json','xml','musicxml'].includes(e)) {
    const raw = await file.text()
    if (e === 'json') { try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw } }
    if (e === 'html' || e === 'htm') {
      const doc = new DOMParser().parseFromString(raw, 'text/html')
      return (doc.body?.innerText || doc.body?.textContent || '').trim()
    }
    return raw.trim()
  }
  return 'Original file attached. Text preview is not available for this format.'
}

async function loadNotes() {
  const data = await request('/notes')
  notes = data.notes || []
  render()
  $('#syncState').textContent = 'Synced to your LWL account'
  $('#noteCount').textContent = notes.filter(x => !x.deletedAt).length + ' notes · synced to your LWL account'
}
function addFolder(nav, key, label, count, depth = 0) {
  const button = document.createElement('button')
  button.type = 'button'; button.className = 'folder' + (folder === key ? ' active' : ''); button.dataset.folder = key
  button.style.paddingLeft = (9 + Math.min(depth, 7) * 12) + 'px'
  const name = document.createElement('span'); name.textContent = label
  const number = document.createElement('small'); number.textContent = count
  button.append(name, number); nav.append(button)
}
function render() {
  const nav = $('#folderList'), list = $('#notesList'), active = notes.filter(n => !n.deletedAt)
  nav.replaceChildren(); list.replaceChildren()
  const counts = new Map()
  for (const n of active) {
    const p = (n.folderPath || '').trim()
    if (!p) counts.set('', (counts.get('') || 0) + 1)
    else { const parts = p.split('/'); for (let i=1;i<=parts.length;i++) { const key=parts.slice(0,i).join('/'); counts.set(key,(counts.get(key)||0)+1) } }
  }
  addFolder(nav,'*','All notes',active.length); addFolder(nav,'','Unfiled',counts.get('')||0)
  for (const p of [...counts.keys()].filter(Boolean).sort((a,b)=>a.localeCompare(b))) addFolder(nav,p,p.split('/').pop(),counts.get(p),p.split('/').length-1)
  const q = $('#noteSearch').value.trim().toLowerCase()
  const shown = active.filter(n => (folder==='*' || (folder==='' ? !n.folderPath : n.folderPath===folder || n.folderPath?.startsWith(folder+'/'))) &&
    (!q || [n.title,n.body,n.folderPath,n.source].join(' ').toLowerCase().includes(q)))
  const mode = $('#noteSort').value
  shown.sort((a,b) => mode==='title' ? a.title.localeCompare(b.title) : mode==='oldest' ? Date.parse(a.createdAt)-Date.parse(b.createdAt) : Date.parse(b.updatedAt)-Date.parse(a.updatedAt))
  if (!shown.length) { const empty=document.createElement('div');empty.className='empty';empty.textContent=active.length?'No notes match this folder or search.':'Your notes will appear here after import.';list.append(empty);return }
  for (const n of shown) {
    const card=document.createElement('article');card.className='note'
    const title=document.createElement('div');title.className='notetitle';title.textContent=n.title
    const meta=document.createElement('div');meta.className='meta';meta.textContent=(n.source||'PhrasePath')+' · '+new Date(n.updatedAt).toLocaleString()
    const pill=document.createElement('span');pill.className='pill';pill.textContent=n.folderPath||'Unfiled'
    card.append(title,meta,pill)
    if(n.body){const body=document.createElement('p');body.className='body';body.textContent=n.body;card.append(body)}
    const actions=document.createElement('div');actions.className='actions'
    if(n.attachmentName){const open=document.createElement('button');open.type='button';open.className='btn';open.textContent='Open original · '+n.attachmentName;open.onclick=()=>openAttachment(n);actions.append(open)}
    const edit=document.createElement('button');edit.type='button';edit.className='btn';edit.textContent='Edit / move';edit.onclick=()=>editNote(n.id);actions.append(edit)
    const del=document.createElement('button');del.type='button';del.className='btn danger';del.textContent='Delete';del.onclick=()=>deleteNote(n);actions.append(del)
    card.append(actions);list.append(card)
  }
}
async function openAttachment(note) {
  try {
    const data = await request('/notes/'+note.id+'/attachment')
    const link = document.createElement('a'); link.href = data.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click()
  } catch { say('Could not open that attachment. Refresh the library and try again.') }
}
function editNote(id) {
  const note=notes.find(n=>n.id===id); if(!note)return
  editingId=id;$('#editName').value=note.title||'';$('#editFolder').value=note.folderPath||'';$('#editBody').value=note.body||''
  $('#editAttachment').textContent=note.attachmentName?'Original attachment is preserved: '+note.attachmentName:'No original file attached.'
  $('#editDialog').classList.add('show');$('#editName').focus()
}
async function saveEdit() {
  const note=notes.find(n=>n.id===editingId);if(!note)return
  await request('/notes/'+note.id,{method:'PUT',body:JSON.stringify({title:$('#editName').value,folderPath:$('#editFolder').value,body:$('#editBody').value,source:note.source,createdAt:note.createdAt})})
  $('#editDialog').classList.remove('show');editingId=null;await loadNotes()
}
async function deleteNote(note) {
  if(!confirm('Move “'+note.title+'” to deleted notes? It will be removed from this library.'))return
  await request('/notes/'+note.id,{method:'DELETE'});await loadNotes()
}
async function uploadAttachment(id,file) {
  const token=await account.accessToken()
  if(!token)throw Object.assign(new Error('Sign in again to sync your notes.'),{status:401})
  if(file.size>50*1024*1024)throw new Error(file.name+' exceeds the 50 MB attachment limit; note text was saved.')
  if(!file.size)return
  const response=await fetch(api+'/notes/'+id+'/attachment',{method:'POST',cache:'no-store',referrerPolicy:'no-referrer',mode:'cors',credentials:'omit',
    headers:{Authorization:'Bearer '+token,'Content-Type':file.type||'application/octet-stream','X-PhrasePath-Filename':encodeURIComponent(file.name)},body:file})
  if(!response.ok){let d={};try{d=await response.json()}catch{};throw new Error(d.error||'Could not upload the original file.')}
}
async function importFiles(inputFiles) {
  const status=$('#importStatus'), source=$('#noteSource').value
  let items=[]
  for(const file of inputFiles){if(ext(file)==='zip')items.push(...await unzip(file));else items.push(file)}
  if(!items.length){say('No note files were found.');return}
  for(let i=0;i<items.length;i++){
    const file=items[i], extension=ext(file);if(file.phrasePathDriveFileId&&notes.some(n=>n.driveFileId===file.phrasePathDriveFileId)){continue}status.textContent='Importing '+(i+1)+' of '+items.length+': '+file.name
    let title=titleOf(file), body=''
    try { if(extension==='sdocx'){const parsed=await decodeSdocx(file);title=parsed.title||title;body=parsed.body}else body=await readText(file) }
    catch(e){console.warn('PhrasePath Samsung Notes extraction failed',e);body='Text preview could not be created; the original file is attached.'}
    const id=crypto.randomUUID(), folderPath=pathOf(file)
    await request('/notes/'+id,{method:'PUT',body:JSON.stringify({id,title,body,source,folderPath,createdAt:new Date(file.lastModified||Date.now()).toISOString(),driveFileId:file.phrasePathDriveFileId||null})})
    try { await uploadAttachment(id,file) }
    catch(e){say(e.message+' Earlier files may already be synced.');continue}
  }
  await loadNotes();if(items.some(f=>f.phrasePathDriveFileId))say(notes.filter(n=>n.driveFileId&&items.some(f=>f.phrasePathDriveFileId===n.driveFileId)).length+' Drive notes are synced to your LWL account.');else say(items.length+' notes imported and synced to your LWL account.')
}
async function driveRequest(path, options={}) { return request(path, options) }

async function loadDriveSettings() {
  try {
    driveConfig = await driveRequest('/drive/config')
    const data = await driveRequest('/drive/folder')
    driveFolder = data.folder || null
    $('#driveFolderState').textContent = driveFolder
      ? 'Connected folder: ' + driveFolder.name + (driveFolder.email ? ' · ' + driveFolder.email : '')
      : (driveConfig.configured ? 'No folder selected. Choose the PhrasePath folder in your Google Drive.' : 'Google Drive import is waiting for its API key, project number and dedicated OAuth client.')
    $('#importDriveFiles').disabled = !driveFolder || !driveConfig.configured
    $('#disconnectDriveFolder').classList.toggle('hidden', !driveFolder)
  } catch (e) { $('#driveFolderState').textContent = 'Could not load your Drive folder: ' + e.message }
}

function loadGoogleScript(src, test) {
  if (test()) return Promise.resolve()
  const existing = [...document.querySelectorAll('script[data-phrasepath-google]')].find(script=>script.dataset.googleSrc===src)
  if (existing) return new Promise((resolve,reject)=>{existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true})})
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=src;script.async=true;script.defer=true;script.dataset.phrasepathGoogle='1';script.dataset.googleSrc=src
    script.onload=resolve;script.onerror=()=>reject(new Error('Google Drive could not load. Check your connection and try again.'))
    document.head.append(script)
  })
}

async function googleDriveToken() {
  if (!driveConfig?.configured) throw new Error('Google Drive is not configured yet. Its API key, project number and authorized web OAuth client are still needed.')
  await loadGoogleScript('https://accounts.google.com/gsi/client',()=>Boolean(window.google?.accounts?.oauth2))
  return new Promise((resolve,reject)=>{
    if(driveAccessToken && driveTokenExpiresAt>Date.now()+60000){resolve(driveAccessToken);return}
    const client=google.accounts.oauth2.initTokenClient({
      client_id:driveConfig.clientId,
      scope:'https://www.googleapis.com/auth/drive.file',
      callback:response=>{if(response?.access_token){driveAccessToken=response.access_token;driveTokenExpiresAt=Date.now()+Number(response.expires_in||3600)*1000;resolve(driveAccessToken)}else reject(new Error(response?.error_description||'Google Drive authorization was not completed.'))}
    })
    client.requestAccessToken({prompt:''})
  })
}

async function openDrivePicker(selectFolder=false) {
  const accessToken=await googleDriveToken()
  if (!drivePickerPromise) drivePickerPromise=loadGoogleScript('https://apis.google.com/js/api.js',()=>Boolean(window.gapi?.load)).then(()=>new Promise((resolve,reject)=>gapi.load('picker',{callback:resolve,onerror:()=>reject(new Error('Google Picker did not load.'))})))
  await drivePickerPromise
  return new Promise((resolve,reject)=>{
    const builder=new google.picker.PickerBuilder().setDeveloperKey(driveConfig.pickerApiKey).setOAuthToken(accessToken).setOrigin(window.location.protocol+'//'+window.location.host)
    if(driveConfig.appId) builder.setAppId(driveConfig.appId)
    if(selectFolder) {
      const view=new google.picker.DocsView(google.picker.ViewId.FOLDERS).setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder')
      builder.addView(view).setTitle('Choose your PhrasePath folder')
    } else {
      const view=new google.picker.DocsView(google.picker.ViewId.DOCS).setParent(driveFolder.id).setIncludeFolders(false).setMimeTypes('application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,application/vnd.google-apps.document')
      builder.addView(view).enableFeature(google.picker.Feature.MULTISELECT_ENABLED).setTitle('Select exported notes')
    }
    builder.setCallback(async data=>{
      if(data.action===google.picker.Action.CANCEL){resolve(null);return}
      if(data.action!==google.picker.Action.PICKED)return
      resolve(data.docs||[])
    }).build().setVisible(true)
  })
}

$('#chooseDriveFolder').addEventListener('click',async()=>{
  $('#driveStatus').textContent='Opening Google Drive…'
  try {
    const docs=await openDrivePicker(true)
    if(!docs?.length){$('#driveStatus').textContent='Folder selection cancelled.';return}
    const chosen=docs[0]
    const result=await driveRequest('/drive/folder',{method:'PUT',body:JSON.stringify({id:chosen.id,name:chosen.name,email:chosen.emailAddress||''})})
    driveFolder=result.folder;await loadDriveSettings();$('#driveStatus').textContent='Your PhrasePath folder is saved to your LWL account.'
  } catch(e){$('#driveStatus').textContent=e.message}
})
$('#importDriveFiles').addEventListener('click',async()=>{
  $('#driveStatus').textContent='Opening your PhrasePath folder…'
  try {
    const docs=await openDrivePicker(false)
    if(!docs?.length){$('#driveStatus').textContent='No files selected.';return}
    if(docs.length>100){$('#driveStatus').textContent='Select up to 100 files per batch.';return}
    const token=await googleDriveToken(), files=[]
    for(let i=0;i<docs.length;i++){
      const doc=docs[i]
      $('#driveStatus').textContent='Reading '+(i+1)+' of '+docs.length+': '+doc.name
      const googleDoc=doc.mimeType==='application/vnd.google-apps.document'
      const endpoint=googleDoc
        ? 'https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(doc.id)+'/export?mimeType=application/pdf'
        : 'https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(doc.id)+'?alt=media'
      const response=await fetch(endpoint,{headers:{Authorization:'Bearer '+token},cache:'no-store',referrerPolicy:'no-referrer'})
      if(!response.ok)throw new Error('Could not download '+doc.name+' from Google Drive ('+response.status+').')
      const blob=await response.blob(), name=googleDoc?doc.name+'.pdf':doc.name
      const file=new File([blob],name,{type:googleDoc?'application/pdf':(blob.type||doc.mimeType||'application/octet-stream'),lastModified:Date.now()})
      file.phrasePathDriveFileId=doc.id;files.push(file)
    }
    $('#noteSource').value='Samsung Notes'
    $('#driveStatus').textContent='Importing '+files.length+' files…'
    await importFiles(files)
    $('#driveStatus').textContent='Finished importing selected files from your Google Drive.'
  } catch(e){$('#driveStatus').textContent=e.message}
})
$('#disconnectDriveFolder').addEventListener('click',async()=>{
  try{await driveRequest('/drive/folder',{method:'DELETE'});driveFolder=null;await loadDriveSettings();$('#driveStatus').textContent='The saved folder choice was removed. Google access tokens are never stored.'}
  catch(e){$('#driveStatus').textContent=e.message}
})

function showSignedIn(user) {
  currentEmail=user?.email||''
  $('#signInPanel').classList.add('hidden');$('#library').classList.remove('hidden');$('#signOut').classList.remove('hidden')
  $('#syncState').textContent='Signed in · '+currentEmail
  loadDriveSettings();loadNotes().catch(e=>{if(e.status===401){showSignedOut();authSay('Your sign-in expired. Sign in again to sync notes.')}else say('Could not load notes: '+e.message)})
}
function showSignedOut() {
  $('#signInPanel').classList.remove('hidden');$('#library').classList.add('hidden');$('#signOut').classList.add('hidden')
  $('#syncState').textContent='Sign in to your LWL account'
}
$('#emailForm').addEventListener('submit',async e=>{e.preventDefault();const email=$('#email').value.trim().toLowerCase();if(!email)return;$('#sendCode').disabled=true;authSay('Sending a code…');try{await account.requestCode(email);currentEmail=email;$('#codeForm').classList.remove('hidden');authSay('Check your email for a sign-in code.')}catch(err){authSay(err.message)}finally{$('#sendCode').disabled=false}})
$('#codeForm').addEventListener('submit',async e=>{e.preventDefault();const code=$('#code').value.trim();$('#codeForm button').disabled=true;authSay('Verifying…');try{const user=await account.verifyCode(currentEmail,code);showSignedIn(user);authSay('')}catch(err){authSay(err.message)}finally{$('#codeForm button').disabled=false}})
$('#signOut').addEventListener('click',async()=>{await account.signOut().catch(()=>{});showSignedOut();authSay('Signed out of the LWL account on this browser.')})
$('#noteFiles').addEventListener('change',e=>{const files=[...e.target.files];e.target.value='';if(files.length)importFiles(files).catch(e=>say(e.message))})
$('#noteFolder').addEventListener('change',e=>{const files=[...e.target.files];e.target.value='';if(files.length)importFiles(files).catch(e=>say(e.message))})
$('#refreshNotes').addEventListener('click',()=>loadNotes().catch(e=>say(e.message)))
$('#noteSearch').addEventListener('input',render);$('#noteSort').addEventListener('change',render)
$('#folderList').addEventListener('click',e=>{const b=e.target.closest('[data-folder]');if(b){folder=b.dataset.folder;render()}})
$('#cancelEdit').addEventListener('click',()=>{$('#editDialog').classList.remove('show');editingId=null})
$('#saveEdit').addEventListener('click',()=>saveEdit().catch(e=>alert(e.message)))
$('#editDialog').addEventListener('click',e=>{if(e.target.id==='editDialog'){$('#editDialog').classList.remove('show');editingId=null}})
$('#noteFiles').disabled=false
try { const user=await account.user(); if(user?.email){showSignedIn(user)}else showSignedOut() } catch(e){showSignedOut();authSay(e.message)}
