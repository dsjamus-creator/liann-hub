import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
import {serve} from '../scripts/serve.mjs'
const server=await serve(0),hub=`http://127.0.0.1:${server.address().port}/`,backend='https://lwl-backend-mhgo.onrender.com'
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium'})
const lessonId='11111111-1111-4111-8111-111111111111',listId='22222222-2222-4222-8222-222222222222',words=[{id:'33333333-3333-4333-8333-333333333333',hz:'你好',py:'nǐ hǎo',gl:'hello'},{id:'44444444-4444-4444-8444-444444444444',hz:'再见',py:'zài jiàn',gl:'goodbye'}]
const lesson={id:lessonId,student:'Learner Example',tutor:'Tutor Example',topic:'Greetings',starts_at:'2026-01-01T10:00:00Z',ends_at:'2026-01-01T11:00:00Z',status:'completed'}
try{for(const width of [1280,390]){
 let record=null,attempts=0,reviewed=false
 async function open(role){
  const context=await browser.newContext({viewport:{width,height:1000}})
  await context.addInitScript(role=>{localStorage.setItem('liann-hub-tour-done','true');localStorage.setItem('liann-hub-session-v1',JSON.stringify({access_token:role,refresh_token:'rt',expires_at:Math.floor(Date.now()/1000)+3600,email:role+'@example.test'}))},role)
  await context.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.fulfill({body:'',contentType:'text/css'}))
  await context.route('https://api.pinyintiles.com/**',r=>r.fulfill({json:{authentication:{enabled:true,supabaseUrl:'https://demo.supabase.co',publishableKey:'pk-test'}}}))
  await context.route('https://demo.supabase.co/auth/v1/**',r=>r.fulfill({json:{email:role+'@example.test',email_confirmed_at:'2026-01-01'}}))
  await context.route(backend+'/**',r=>{
   const path=new URL(r.request().url()).pathname,body=r.request().postData()?r.request().postDataJSON():null
   if(path==='/admin/whoami')return r.fulfill({status:403,json:{error:'super_admin_only'}})
   if(path==='/learning/workspace')return r.fulfill({json:{roles:[role]}})
   if(path==='/learning/workspace/'+role)return r.fulfill({json:{role,profile:{full_name:role+' Example'},data:{past:[lesson],upcoming:[{...lesson,id:'55555555-5555-4555-8555-555555555555',topic:'Next lesson',starts_at:new Date(Date.now()+30*60000).toISOString(),ends_at:new Date(Date.now()+90*60000).toISOString(),status:'booked'}],children:role==='guardian'?[{id:'child',full_name:'Learner Example'}]:undefined,students:[]}}})
   if(path==='/learning/followups')return r.fulfill({json:{items:record&&(role==='tutor'||record.status==='published')?[{...record,...lesson,lesson_id:lessonId,status:record.status}]:[]}})
   if(path==='/learning/followups/'+lessonId){
    if(body){assert.equal(role,'tutor');assert.equal(body.version,record?.version||0);record={...body,lesson_id:lessonId,id:'followup',version:(record?.version||0)+1,assigned_setlist_id:body.status==='published'?listId:null};return r.fulfill({json:{ok:true,version:record.version}})}
    return r.fulfill({json:{lesson:{...lesson,as_tutor:role==='tutor',as_student:role==='student',as_guardian:role==='guardian'},record:role==='tutor'||record?.status==='published'?record:null,setlists:role==='tutor'?[{id:listId,name:'Greetings SetList'}]:[],metrics:record?.assigned_setlist_id&&(role==='student'||record.share_progress)?{attempts,mastered_words:0}:null}})
   }
   if(path.endsWith('/words'))return r.fulfill({json:{words}})
   if(path.endsWith('/attempt')){assert.equal(role,'student');assert.equal(body.answered_correct,undefined);assert.ok(body.eventId);attempts++;return r.fulfill({json:{correct:body.wordId===body.choiceId,meaning:words.find(w=>w.id===body.wordId).gl}})}
   if(path.endsWith('/completion')){assert.equal(role,'student');record.completed_at=body.done?new Date().toISOString():null;return r.fulfill({json:{ok:true,masteryChanged:false}})}
   if(path.startsWith('/learning/followups/')&&path.endsWith('/sharing')){assert.equal(role,'student');record.share_progress=body.enabled;return r.fulfill({json:{ok:true}})}
   if(path.endsWith('/review')){assert.equal(role,'tutor');record.review_note=body.note;record.reviewed_at=new Date().toISOString();reviewed=true;return r.fulfill({json:{ok:true}})}
   if(path.endsWith('/withdraw')){record.status='withdrawn';return r.fulfill({json:{ok:true}})}
   if(path==='/learning/household')return r.fulfill({status:404,json:{}})
   if(path==='/learning/progress')return r.fulfill({json:{masteredWords:0,milestones:[],words:[]}})
   if(path==='/learning/setlists')return r.fulfill({json:{setlists:[]}})
   return r.fulfill({json:{institutions:[]}})
  })
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(hub);await page.locator('.workspace-rail').waitFor();return {page,context,errors}
 }
 const tutor=await open('tutor'),p=tutor.page
 await p.locator('.workspace-rail [data-workspace=calendar]').click();await p.getByRole('button',{name:'Summary and practice',exact:true}).click()
 await p.getByLabel('What we covered').fill('We practised greetings.')
 await p.locator('#bell').click();await p.locator('#notifclose').click();assert.equal(await p.getByLabel('What we covered').inputValue(),'We practised greetings.')
 await p.getByLabel('Feedback for the learner').fill('Clear tones; keep practising.')
 await p.getByLabel('Next learning goal').fill('Greet someone confidently')
 await p.getByLabel('Practice before the next lesson').fill('Review the assigned words.')
 await p.getByLabel('Due date (optional)').fill('2027-01-01')
 await p.getByLabel('Assign a copy of a tutor SetList (optional)').selectOption(listId)
 await p.getByRole('button',{name:'Save private draft',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#followup-form')&&!document.querySelector('#followup-form button[disabled]'))
 assert.equal(record.status,'draft')
 const student=await open('student');assert.equal(await student.page.locator('[data-followup]').count(),0)
 await p.getByRole('button',{name:'Share summary and assign practice',exact:true}).click();await p.locator('#followup-review').waitFor();assert.equal(record.status,'published')
 await student.page.reload();await student.page.getByRole('button',{name:'View summary and practice',exact:true}).click();await student.page.getByRole('button',{name:'Practise assigned words',exact:true}).waitFor()
 assert.equal(await student.page.locator('#followup-form').count(),0)
 await student.page.getByRole('button',{name:'Practise assigned words',exact:true}).click();await student.page.getByRole('button',{name:'hello',exact:true}).click();await student.page.getByRole('status').filter({hasText:'Correct:'}).waitFor();assert.equal(attempts,1)
 await student.page.getByRole('button',{name:'Mark practice done',exact:true}).click();await student.page.getByRole('button',{name:'Mark practice unfinished',exact:true}).waitFor();assert.ok(record.completed_at)
 await student.page.locator('#share-assignment-progress').check();await student.page.waitForFunction(()=>document.querySelector('#share-assignment-progress:checked')&&!document.querySelector('#share-assignment-progress:disabled'))
 const guardian=await open('guardian');await guardian.page.getByRole('button',{name:'View summary and practice',exact:true}).click();await guardian.page.getByRole('heading',{name:'Practice evidence',exact:true}).waitFor()
 assert.ok((await guardian.page.locator('#main').textContent()).includes('1 recorded attempts'))
 assert.equal(await guardian.page.locator('[data-practice-done],#share-assignment-progress,#followup-form,#start-assigned-practice').count(),0)
 await guardian.page.locator('#close-followup').click();await guardian.page.locator('#bell').click();await guardian.page.getByText(/Starting soon: Next lesson/).waitFor()
 await p.getByLabel('Tutor review',{exact:true}).fill('Review greetings at the next lesson.');await p.getByRole('button',{name:'Save tutor review',exact:true}).click();await p.locator('#followup-review').waitFor();assert.ok(reviewed)
 if(process.env.SHOTS){await student.page.waitForTimeout(350);await student.page.screenshot({path:`${process.env.SHOTS}/student-lesson-followup-${width}.png`,fullPage:true});await guardian.page.locator('#notifclose').click();await guardian.page.waitForTimeout(350);await guardian.page.screenshot({path:`${process.env.SHOTS}/guardian-learning-overview-${width}.png`,fullPage:true})}
 p.on('dialog',dialog=>dialog.accept());await p.getByRole('button',{name:'Withdraw shared summary',exact:true}).click();await p.locator('#followup-form').waitFor();assert.equal(record.status,'withdrawn')
 await student.page.reload();await student.page.locator('.workspace-rail').waitFor();await student.page.getByText('No shared summaries or assigned practice yet.',{exact:true}).waitFor()
 for(const session of [tutor,student,guardian]){assert.deepEqual(session.errors,[]);assert.ok(await session.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await session.context.close()}
 console.log(`PASS ${width}: draft/share, assigned practice, measured answer, completion, consent, guardian read-only, reminder, review and withdrawal`)
 }}finally{await browser.close();server.close()}
