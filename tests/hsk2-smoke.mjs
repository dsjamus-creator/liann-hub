import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {serve} from '../scripts/serve.mjs';
import {catalogue,lesson} from './fixtures/hsk.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/hsk2-course.json',import.meta.url)));
const server=await serve(0),origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium'});
try{for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:1000}});await page.goto(origin+'/');
 await page.evaluate(async({fixture,catalogue,lesson})=>{
  const {hskPage,createHskController}=await import('/src/hsk.js');
  const clean=fixture.tasks.map(({reference,questions,characterQuestions,...t})=>({...t,...(questions?{questions:questions.map(({answer,...q})=>q)}:{}),...(characterQuestions?{characterQuestions:characterQuestions.map(({answer,...q})=>q)}:{})}));
  const plan={title:fixture.unit.title,target_level:2,goal:fixture.unit.goal,stages:fixture.unit.teachingStages,version:1,status:'published',course_unit:{id:fixture.unit.id},materials:clean};
  const attempt={id:'attempt2',status:'started',plan_version:1,snapshot:{title:fixture.unit.title,targetLevel:2,materials:clean},results:[],observations:[],answers:{}};
  const state={user:{email:'learner@example.test'},workspaceRole:'student',workspaceAccess:{roles:['student']},hsk:{status:'ok',catalogue:{...catalogue,course:{units:[fixture.unit]}},lessons:[],attempts:[],responses:{},attemptId:'attempt2',detail:{lesson,plan,attempts:[attempt]}}};
  let controller;const render=()=>{document.body.innerHTML='<main style="max-width:900px;margin:auto;padding:20px">'+hskPage(state)+'</main>';controller.bind()};
  controller=createHskController({state,render,account:{hskRequest:async(path,body)=>{if(path.includes('/submit')){window.submitted=body;attempt.status='submitted';attempt.answers=body.answers;attempt.snapshot.materials=fixture.tasks;attempt.results=[{taskId:fixture.tasks.find(t=>t.skill==='writing').id,skill:'writing',correct:10,total:10,needsReview:true}];return {attempt}}if(path.startsWith('/plans/'))return state.hsk.detail;return {catalogue:state.hsk.catalogue,lessons:[],attempts:[]}}}});render();window.reRenderHsk=render;
 },{fixture,catalogue,lesson});
 const writing=fixture.tasks.find(t=>t.skill==='writing');assert.equal(await page.getByLabel('Missing character',{exact:true}).count(),5);
 assert.ok(!(await page.content()).includes('Tutor-only key evidence'));assert.ok(!(await page.content()).includes('Reference:'));
 for(const task of fixture.tasks){for(const [i,q] of (task.questions||[]).entries())await page.locator(`input[name="${task.id}.${i}"][value="${q.answer}"]`).check();for(const [i,q] of (task.characterQuestions||[]).entries())await page.locator(`input[name="${task.id}.character.${i}"]`).fill(q.answer);if(task.skill==='speaking')await page.locator(`textarea[name="${task.id}.text"]`).fill('I spoke with my tutor.');}
 await page.evaluate(()=>window.reRenderHsk());assert.equal(await page.locator(`input[name="${writing.id}.character.0"]`).inputValue(),writing.characterQuestions[0].answer,'Responses survive a render');
 if(process.env.SHOTS){mkdirSync(process.env.SHOTS,{recursive:true});await page.screenshot({path:`${process.env.SHOTS}/hsk2-character-practice-${width}.png`,fullPage:true})}
 await page.getByRole('button',{name:'Submit practice responses',exact:true}).click();await page.getByRole('heading',{name:/Practice evidence/}).waitFor();const body=await page.evaluate(()=>window.submitted);assert.deepEqual(body.answers[writing.id].characters,writing.characterQuestions.map(q=>q.answer));assert.equal(body.score,undefined);await page.getByText('10/10',{exact:true}).waitFor();assert.ok((await page.content()).includes('Reference:'));await page.close();
}console.log('PASS HSK 2 desktop/phone character entry, retained responses, private keys and structured submission');}finally{await browser.close();server.close()}
