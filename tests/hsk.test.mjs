import assert from 'node:assert/strict'
import {hskPage,hskProgress,printablePack,createHskController} from '../src/hsk.js'
import {catalogue,lesson,tasks,cleanTasks} from './fixtures/hsk.mjs'
const plan={title:'<script>bad()</script>',target_level:4,goal:'Explain a problem',objective_ids:['4-writing'],topic_ids:['4-topic-2'],stages:{},private_notes:'PRIVATE-ONLY',materials:tasks,status:'published',version:1}
const base={status:'ok',catalogue,lessons:[],attempts:[],responses:{},detail:{lesson,plan,attempts:[]}}
assert.ok(hskPage({hsk:base,workspaceRole:'tutor'}).includes('&lt;script&gt;bad()&lt;/script&gt;'))
const teacherPrint=printablePack(base,true);assert.ok(teacherPrint.includes('TEACHER-REFERENCE-GUIDANCE'));assert.ok(!teacherPrint.includes('PRIVATE-ONLY'));assert.ok(!teacherPrint.includes('<script>bad()'))
const learnerBase={...base,detail:{...base.detail,plan:{...plan,private_notes:undefined,materials:cleanTasks(tasks)}}}
assert.ok(!printablePack(learnerBase).includes('TEACHER-REFERENCE-GUIDANCE'))
assert.ok(!printablePack(learnerBase).includes('PRIVATE-ONLY'))
assert.ok(!hskPage({hsk:learnerBase,workspaceRole:'guardian'}).includes('data-hsk-start'))
const oldAttempt={id:'old',plan_version:0,status:'started',snapshot:{title:'Old plan',targetLevel:4,materials:cleanTasks(tasks)},answers:{},results:[],observations:[]}
const revised={...learnerBase,attemptId:'old',detail:{...learnerBase.detail,attempts:[oldAttempt]}}
assert.ok(hskPage({hsk:revised,workspaceRole:'student'}).includes('data-hsk-start="practice"'),'a revised assignment remains startable after an unfinished old attempt')
const attempts=[{student_id:'one',student:'Same Name',target_level:'4',lesson_id:lesson.id,results:[],observations:[]},{student_id:'two',student:'Same Name',target_level:'4',lesson_id:lesson.id,results:[],observations:[]}]
assert.equal((hskProgress({hsk:{...base,attempts}}).match(/Same Name · HSK Level 4/g)||[]).length,2)
let resolveRequest
const state={user:{email:'tutor@example.test'},workspaceRole:'tutor',workspaceAccess:{roles:['tutor','student']},learner:null,institutional:false}
const controller=createHskController({state,render:()=>{},account:{hskRequest:()=>new Promise(r=>{resolveRequest=r})}})
const pending=controller.load();controller.reset();state.workspaceRole='student';resolveRequest({catalogue,lessons:[{id:'PRIVATE-TUTOR-RECORD'}]});await pending;assert.equal(state.hsk,null)
console.log('PASS HSK print key separation, HTML escaping, guardian read-only controls, distinct same-name learners and stale identity response rejection')
