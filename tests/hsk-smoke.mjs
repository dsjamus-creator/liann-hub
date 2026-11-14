import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
import {serve} from '../scripts/serve.mjs'
import {catalogue,lesson,lessonId,tasks,cleanTasks} from './fixtures/hsk.mjs'
const server=await serve(0),hub=`http://127.0.0.1:${server.address().port}/`,backend='https://lwl-backend-mhgo.onrender.com'
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium'})
try{for(const width of [1280,390]){
 let plan=null,attempts=[]
 const sessions=[]
 async function open(role){
  const context=await browser.newContext({viewport:{width,height:1000}});sessions.push(context)
  await context.addInitScript(role=>{window.print=()=>{};localStorage.setItem('liann-hub-tour-done','true');localStorage.setItem('liann-hub-session-v1',JSON.stringify({access_token:role,refresh_token:'rt',expires_at:Math.floor(Date.now()/1000)+3600,email:role+'@example.test'}))},role)
  await context.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.fulfill({body:'',contentType:'text/css'}))
  await context.route('https://api.pinyintiles.com/**',r=>r.fulfill({json:{authentication:{enabled:true,supabaseUrl:'https://demo.supabase.co',publishableKey:'pk-test'}}}))
  await context.route('https://demo.supabase.co/auth/v1/**',r=>r.fulfill({json:{email:role+'@example.test',email_confirmed_at:'2026-01-01'}}))
  await context.route(backend+'/**',async r=>{
   const url=new URL(r.request().url()),path=url.pathname,body=r.request().method()==='POST'?r.request().postDataJSON():null
   assert.equal(r.request().headers().authorization,'Bearer '+role)
   if(path==='/admin/whoami')return r.fulfill({status:403,json:{error:'super_admin_only'}})
   if(path==='/learning/workspace')return r.fulfill({json:{roles:[role]}})
   if(path.startsWith('/learning/workspace/'))return r.fulfill({json:{role,profile:{full_name:role+' Example'},data:{upcoming:[lesson],past:[],students:[],children:role==='guardian'?[{id:'student',full_name:'Learner Example'}]:undefined}}})
   if(path==='/learning/hsk')return r.fulfill({json:{catalogue,lessons:[{...lesson,plan_title:plan?.title,plan_status:role==='tutor'?plan?.status:plan?.status==='published'?'published':undefined,target_level:plan?.target_level}],attempts:attempts.filter(a=>a.status!=='started').map(a=>({...a,lesson_id:lessonId,student_id:'student',student:lesson.student,target_level:4}))}})
   if(path==='/learning/hsk/plans/'+lessonId){
    if(body){assert.equal(role,'tutor');assert.equal(body.version,plan?.version||0);plan={id:'plan',...body,target_level:body.targetLevel,objective_ids:body.objectiveIds,topic_ids:body.topicIds,private_notes:body.privateNotes,materials:tasks.filter(t=>body.materialIds.includes(t.id)),version:(plan?.version||0)+1};return r.fulfill({json:{ok:true}})}
    const shared=role==='tutor'||plan?.status==='published',p=shared&&plan?(role==='tutor'?plan:(({private_notes,...p})=>({...p,materials:cleanTasks(p.materials)}))(plan)):null
    return r.fulfill({json:{lesson:{...lesson,as_tutor:role==='tutor',as_student:role==='student',as_guardian:role==='guardian'},plan:p,attempts:shared?attempts.map(a=>({...a,snapshot:{...a.snapshot,materials:role==='tutor'?a.snapshot.materials:cleanTasks(a.snapshot.materials,a.status!=='started')}})):[],...(role==='tutor'?{starterMaterials:tasks}:{})}})
   }
   if(path.endsWith('/start')){assert.equal(role,'student');const a={id:body.attemptId,plan_version:plan.version,status:'started',version:1,mode:body.mode,started_at:new Date().toISOString(),due_at:body.mode==='timed'?new Date(Date.now()+42*60000).toISOString():null,snapshot:{title:plan.title,targetLevel:4,materials:plan.materials},answers:{},results:[],observations:[]};attempts.unshift(a);return r.fulfill({json:{attempt:{...a,snapshot:{...a.snapshot,materials:cleanTasks(a.snapshot.materials)}}}})}
   if(path.endsWith('/submit')){assert.equal(role,'student');assert.equal(body.score,undefined);const a=attempts.find(a=>path.includes(a.id));a.answers=body.answers;a.status='submitted';a.version++;a.submitted_at=new Date().toISOString();a.results=a.snapshot.materials.map(t=>t.questions?{taskId:t.id,skill:t.skill,correct:t.questions.filter((q,i)=>body.answers[t.id].choices[i]===q.answer).length,total:t.questions.length,needsReview:false}:{taskId:t.id,skill:t.skill,needsReview:true,characters:5,minimum:t.minCharacters||0,belowMinimum:!!t.minCharacters});return r.fulfill({json:{attempt:a}})}
   if(path.endsWith('/review')){assert.equal(role,'tutor');const a=attempts.find(a=>path.includes(a.id));a.feedback=body.feedback;a.next_step=body.nextStep;a.observations=body.observations.map(o=>({...o,skill:tasks.find(t=>t.id===o.taskId).skill}));a.status='reviewed';a.reviewed_at=new Date().toISOString();a.version++;return r.fulfill({json:{ok:true}})}
   if(path.endsWith('/withdraw')){plan.status='withdrawn';plan.version++;return r.fulfill({json:{ok:true}})}
   if(path==='/learning/followups')return r.fulfill({json:{items:[]}})
   if(path==='/learning/household')return r.fulfill({status:404,json:{}})
   if(path==='/learning/progress')return r.fulfill({json:{masteredWords:0,milestones:[],words:[]}})
   if(path==='/learning/setlists')return r.fulfill({json:{setlists:[]}})
   return r.fulfill({json:{institutions:[]}})
  })
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(hub);await page.locator('.workspace-rail').waitFor();return {page,context,errors}
 }
 const tutor=await open('tutor'),p=tutor.page
 await p.locator('.workspace-rail [data-workspace=preparation]').click();await p.getByRole('button',{name:'Prepare lesson',exact:true}).click();await p.locator('#hsk-plan-form').waitFor()
 await p.getByLabel('HSK level for this learner').selectOption('4')
 await p.getByLabel('Lesson title',{exact:true}).fill('Asking for help — HSK 4')
 await p.getByLabel('What will the learner be able to do?').fill('Explain a problem and propose a solution without prompting.')
 await p.locator('input[name=topicIds]').check()
 for(const skill of ['listening','reading','speaking','writing'])await p.locator(`input[name=objectiveIds][value="4-${skill}"]`).check()
 for(const task of tasks)await p.locator(`input[name=materialIds][value="${task.id}"]`).check()
 await p.getByRole('button',{name:'Fill empty steps with a preparation scaffold'}).click()
 await p.getByLabel('Private tutor preparation notes (never shared)').fill('PRIVATE-ONLY')
 await p.locator('#bell').click();await p.locator('#notifclose').click();assert.equal(await p.getByLabel('Lesson title',{exact:true}).inputValue(),'Asking for help — HSK 4')
 await p.getByRole('button',{name:'Save private lesson plan',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#hsk-plan-form')&&!document.querySelector('#hsk-plan-form button[disabled]'));assert.equal(plan.status,'draft')
 const student=await open('student');await student.page.locator('.workspace-rail [data-workspace=hsk]').click();assert.equal(await student.page.locator('[data-hsk-open]').count(),0)
 const popupPromise=p.waitForEvent('popup');await p.getByRole('button',{name:'Print preparation pack',exact:true}).click();const pack=await popupPromise;await pack.waitForLoadState('domcontentloaded');assert.ok((await pack.content()).includes('TEACHER-REFERENCE-GUIDANCE'));assert.ok(!(await pack.content()).includes('PRIVATE-ONLY'));await pack.close()
 if(process.env.SHOTS){await p.evaluate(()=>document.querySelector('#main').scrollTop=0);await p.waitForTimeout(350)}
 if(process.env.SHOTS)await p.screenshot({path:`${process.env.SHOTS}/hsk-tutor-preparation-${width}.png`,fullPage:true})
 await p.getByRole('button',{name:'Share plan and assign practice',exact:true}).click();await p.locator('#hsk-withdraw').waitFor();assert.equal(plan.status,'published')
 await student.page.reload();await student.page.locator('.workspace-rail [data-workspace=hsk]').click();await student.page.getByRole('button',{name:'Open practice',exact:true}).click();await student.page.getByRole('button',{name:'Start timed practice',exact:true}).click();await student.page.locator('#hsk-response-form').waitFor()
 assert.ok(!(await student.page.content()).includes('TEACHER-REFERENCE-GUIDANCE'));assert.ok(!(await student.page.content()).includes('PRIVATE-ONLY'))
 await student.page.locator('input[name="hsk3-v1-4-reading.0"][value="0"]').check()
 await student.page.locator('input[name="hsk3-v1-4-listening.0"][value="1"]').check()
 await student.page.locator('textarea[name="hsk3-v1-4-speaking.text"]').fill('I explained the broken chair to my tutor.')
 await student.page.locator('textarea[name="hsk3-v1-4-writing.text"]').fill('昨天，我买的椅子坏了。我给商店打电话，请他们帮我换一把。')
 await student.page.locator('#bell').click();await student.page.locator('#notifclose').click();assert.ok((await student.page.locator('textarea[name="hsk3-v1-4-writing.text"]').inputValue()).includes('昨天'))
 await student.page.getByRole('button',{name:'Submit practice responses',exact:true}).click();await student.page.getByRole('heading',{name:/Practice evidence/}).waitFor();assert.equal(attempts[0].status,'submitted');await student.page.getByText('2/2',{exact:true}).waitFor()
 if(process.env.SHOTS){await student.page.evaluate(()=>document.querySelector('#main').scrollTop=0);await student.page.waitForTimeout(350)}
 if(process.env.SHOTS)await student.page.screenshot({path:`${process.env.SHOTS}/hsk-student-practice-${width}.png`,fullPage:true})
 await p.locator('.workspace-rail [data-workspace=assessment]').click();await p.getByRole('button',{name:'Review submitted practice',exact:true}).waitFor({timeout:2000}).catch(async()=>{await p.locator('#refresh-workspace').click();await p.getByRole('button',{name:'Review submitted practice',exact:true}).waitFor()})
 await p.getByRole('button',{name:'Review submitted practice',exact:true}).click();await p.locator('#hsk-review-form').waitFor()
 for(const skill of ['speaking','writing']){await p.locator(`select[name="hsk3-v1-4-${skill}.judgement"]`).selectOption('developing');await p.locator(`textarea[name="hsk3-v1-4-${skill}.evidence"]`).fill('Completed the task with one prompt; add a reason next time.')}
 await p.getByText('I heard this learner complete the speaking task.',{exact:true}).click()
 await p.getByLabel('Shared feedback for this learner').fill('You explained the problem clearly.')
 await p.getByLabel('Next lesson focus').fill('Give a reason and result independently.')
 await p.getByRole('button',{name:'Save and share assessment',exact:true}).click();await p.getByRole('paragraph').filter({hasText:/^You explained the problem clearly\.$/}).waitFor();assert.equal(attempts[0].status,'reviewed')
 if(process.env.SHOTS){await p.evaluate(()=>document.querySelector('#main').scrollTop=0);await p.waitForTimeout(350)}
 if(process.env.SHOTS)await p.screenshot({path:`${process.env.SHOTS}/hsk-tutor-assessment-${width}.png`,fullPage:true})
 const guardian=await open('guardian');await guardian.page.locator('.workspace-rail [data-workspace=hsk]').click();await guardian.page.getByRole('button',{name:'Open practice',exact:true}).click();await guardian.page.getByText('You explained the problem clearly.',{exact:true}).waitFor();assert.equal(await guardian.page.locator('[data-hsk-start],#hsk-response-form,#hsk-review-form,#hsk-plan-form').count(),0)
 await guardian.page.locator('.workspace-rail [data-workspace=progress]').click();await guardian.page.getByRole('heading',{name:'HSK learning evidence',exact:true}).waitFor();await guardian.page.getByText('Learner Example · HSK Level 4',{exact:true}).waitFor()
 if(process.env.SHOTS){await guardian.page.evaluate(()=>document.querySelector('#main').scrollTop=0);await guardian.page.waitForTimeout(350)}
 if(process.env.SHOTS)await guardian.page.screenshot({path:`${process.env.SHOTS}/hsk-guardian-progress-${width}.png`,fullPage:true})
 p.on('dialog',d=>d.accept());await p.getByRole('button',{name:'Withdraw plan to revise',exact:true}).click();await p.locator('#hsk-plan-form').waitFor();assert.equal(plan.status,'withdrawn')
 for(const session of [tutor,student,guardian]){assert.deepEqual(session.errors,[]);assert.ok(await session.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow')}
 await Promise.all(sessions.map(c=>c.close()))
 console.log(`PASS ${width}: HSK preparation, private drafts, syllabus task focus, scaffold, teacher printing, publication, timed responses, retained forms, tutor assessment, guardian read-only evidence and withdrawal`)
}}finally{await browser.close();server.close()}
