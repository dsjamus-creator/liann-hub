import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serve} from '../scripts/serve.mjs';
const server=await serve(0),hub=`http://127.0.0.1:${server.address().port}`,backend='https://lwl-backend-mhgo.onrender.com',id='11111111-1111-4111-8111-111111111111';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(hub+'/room-test',r=>r.fulfill({contentType:'text/html',body:`<style>.classroom-frame-slot{height:500px}.classroom-portal{position:fixed}.classroom-portal iframe{width:100%;height:100%}</style><main id="main" style="height:900px;overflow:auto"></main><script type="module">
 import {createClassroomController,classroomSurface} from '/src/classroom.js';
 const state=window.s={user:{email:'tutor@example.test'},workspaceRole:'tutor',view:'hub',page:'workspace',workspaceSection:'classroom',theme:{ds:'liann',t:'dark'}};
 const render=()=>{document.getElementById('main').innerHTML=classroomSurface(state);controller.sync();controller.bind()};
 const controller=window.controller=createClassroomController({state,render,navigate:section=>{state.workspaceSection=section;render()},account:{workspaceLink:async path=>'${backend}/auth/liann/continue?next='+encodeURIComponent(path)}});window.redraw=render;
 window.ready=true;
 </script>`}));
 let frameLoads=0;
 await page.route(backend+'/auth/liann/continue?**',r=>{frameLoads++;return r.fulfill({contentType:'text/html',body:'<!doctype html><h1>Lesson room</h1>'})});
 await page.goto(hub+'/room-test');await page.waitForFunction(()=>window.ready);
 await page.evaluate(id=>controller.open({id,topic:'Speaking practice'}),id);
 await page.locator('#hub-classroom-frame').waitFor();const frame=page.frames().find(f=>f!==page.mainFrame());await frame.waitForLoadState();
 const send=async(type,channel)=>frame.evaluate(({type,channel,origin,id})=>{parent.postMessage({type,lessonId:id,channel},origin)},{type,channel,origin:hub,id});
 const channel=await page.evaluate(()=>s.classroomRoom.channel);
 await send('liann-classroom:ready','incorrect');assert.equal(await page.evaluate(()=>s.classroomRoom.status),'opening');
 await page.evaluate(({id,channel})=>window.dispatchEvent(new MessageEvent('message',{origin:'https://attacker.example',source:document.querySelector('iframe').contentWindow,data:{type:'liann-classroom:ready',lessonId:id,channel}})),{id,channel});
 assert.equal(await page.evaluate(()=>s.classroomRoom.status),'opening');
 await send('liann-classroom:ready',channel);await page.waitForFunction(()=>s.classroomRoom.status==='ready');
 await frame.evaluate(()=>window.keepAliveMarker=42);
 for(const section of ['progress','preparation','classroom'])await page.evaluate(section=>{s.workspaceSection=section;redraw()},section);
 await page.evaluate(()=>{s.theme={ds:'cadence',t:'light'};redraw();redraw()});
 assert.equal(await frame.evaluate(()=>window.keepAliveMarker),42);assert.equal(frameLoads,1,'redraws must never recreate a live frame');
 await send('liann-classroom:unavailable',channel);await page.waitForFunction(()=>s.classroomRoom.status==='blocked');assert.ok(await page.getByText(/separate tab/).count());
 assert.match(await page.locator('iframe').getAttribute('allow'),/camera; microphone; display-capture/);
 await page.evaluate(()=>{s.user=null;redraw()});assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.evaluate(()=>s.classroomRoom),null);
 assert.deepEqual(errors,[]);console.log('PASS embedded classroom exact-origin/channel checks, persistent frame across navigation/theme redraw, blocked-sign-in fallback and identity cleanup');
}finally{await browser.close();server.close()}
