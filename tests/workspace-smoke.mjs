import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
import {serve} from '../scripts/serve.mjs'
const server=await serve(0),hub=`http://127.0.0.1:${server.address().port}/`,backend='https://lwl-backend-mhgo.onrender.com'
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium'})
try{
 for(const width of [1280,390]) for(const roles of [['tutor'],['student'],['tutor','student']]){
  const context=await browser.newContext({viewport:{width,height:900}}),errors=[]
  await context.addInitScript(()=>{localStorage.setItem('liann-hub-tour-done','true');localStorage.setItem('liann-hub-session-v1',JSON.stringify({access_token:'at',refresh_token:'rt',expires_at:Math.floor(Date.now()/1000)+3600,email:'preview@example.test'}))})
  await context.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.fulfill({body:'',contentType:'text/css'}))
  await context.route('https://api.pinyintiles.com/**',r=>r.fulfill({json:{authentication:{enabled:true,supabaseUrl:'https://demo.supabase.co',publishableKey:'pk-test'}}}))
  await context.route('https://demo.supabase.co/auth/v1/**',r=>r.fulfill({json:{email:'preview@example.test',email_confirmed_at:'2026-01-01',user_metadata:{role:'super_admin'}}}))
  await context.route(backend+'/**',r=>{
   const path=new URL(r.request().url()).pathname
   if(path==='/auth/liann/continue') {assert.equal(r.request().headers().authorization,undefined);return r.fulfill({contentType:'text/html',body:'<h1>Authenticated handover preview</h1>'})}
   assert.equal(r.request().headers().authorization,'Bearer at')
   if(path==='/learning/session-pass'){assert.equal(r.request().method(),'POST');assert.ok(r.request().postDataJSON().next.startsWith('/classroom/'));return r.fulfill({json:{url:backend+'/auth/liann/continue#pass=one-time'}})}
   if(path==='/admin/whoami')return r.fulfill({status:403,json:{error:'super_admin_only'}})
   if(path==='/learning/workspace')return r.fulfill({json:{roles}})
   if(path.startsWith('/learning/workspace/')){const role=path.split('/').pop();return r.fulfill({json:{role,profile:{full_name:'Preview '+role},data:{upcoming:[{id:'11111111-1111-4111-8111-111111111111',starts_at:'2027-01-01T12:00:00Z',topic:'Conversational Mandarin',tutor:'Tutor Example',student:'Student Example'}],past:[],students:[{full_name:'Student Example'}],earnings:{earnedPence:2500,pendingPence:500,refundedPence:0}}}})}
   if(path==='/learning/progress')return r.fulfill({json:{masteredWords:5,milestones:[{masteredWords:5,achieved:true}],words:[{mastered:true,hz:'你好',py:'nǐ hǎo',meaning:'hello',setlist:'Greetings'}]}})
   if(path==='/learning/household')return r.fulfill({status:404,json:{}})
   if(path==='/learning/setlists')return r.fulfill({json:{setlists:[]}})
   return r.fulfill({json:{institutions:[]}})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(hub)
  await page.locator('.workspace-rail').waitFor()
  assert.equal(await page.locator('#pick').count(),0)
  assert.ok(page.url().includes('#workspace/'+roles[0]+'/overview'))
  await page.getByText('Conversational Mandarin',{exact:true}).waitFor()
  const popupPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'Join lesson',exact:true}).click();const popup=await popupPromise;await popup.waitForURL(backend+'/auth/liann/continue#pass=one-time');assert.ok(!popup.url().includes('access_token'));await popup.close()
  const sections=roles[0]==='tutor'?['overview','calendar','people','classroom','authorboard','setlists','progress','earnings','profile']:['overview','lessons','classroom','people','practice','setlists','progress','profile']
  for(const section of sections){await page.locator(`.workspace-rail [data-workspace="${section}"]`).click();await page.locator('.workspace-heading h1').waitFor();assert.equal(await page.locator('.workspace-rail [aria-current=page]').getAttribute('data-workspace'),section)}
  await page.locator('.workspace-rail [data-workspace=progress]').click();await page.getByText('5 mastered words',{exact:true}).waitFor();assert.ok((await page.locator('#main').textContent()).includes('five consecutive correct'))
  assert.equal(await page.locator('.admin-rail [data-admin]').count(),0)
  if(roles.length>1){await page.selectOption('#workspace-role','student');assert.ok(page.url().includes('/student/overview'));await page.getByText('Conversational Mandarin',{exact:true}).waitFor()}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow')
  await page.reload();await page.locator('.workspace-rail').waitFor();assert.ok(page.url().includes('#workspace/'))
  if(process.env.SHOTS){await page.locator('.workspace-rail [data-workspace=progress]').click();await page.waitForTimeout(400);await page.screenshot({path:`${process.env.SHOTS}/hub-${roles.join('-')}-progress-${width}.png`,fullPage:true})}
  assert.deepEqual(errors,[]);console.log(`PASS ${width}: ${roles.join('+')} navigation, default landing, Progress, role switch and persistence`);await context.close()
 }
}finally{await browser.close();server.close()}
