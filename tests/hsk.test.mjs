import {readFileSync} from 'node:fs'
import {coursePage} from '../src/hsk-course.js'
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

const courseFixture=JSON.parse(readFileSync(new URL('./fixtures/hsk-course.json',import.meta.url)))
const unit=courseFixture.course.units[0],review=courseFixture.tasks.find(t=>t.stage==='delayed_review')
const courseH={...base,catalogue:{...catalogue,course:courseFixture.course},detail:{...base.detail,plan:{...plan,course_unit:{id:unit.id},review_materials:[{...review,reference:'RESERVED-REVIEW-KEY'}]}}}
assert.ok(printablePack(courseH,true).includes('RESERVED-REVIEW-KEY'))
assert.ok(!printablePack(courseH,false).includes('RESERVED-REVIEW-KEY'))
assert.ok(printablePack(courseH,false).includes('Focus vocabulary'))
assert.ok(coursePage({hsk:courseH,workspaceRole:'tutor'}).includes('Outline'))
assert.ok(!coursePage({hsk:{...courseH,unitViewId:unit.id},workspaceRole:'student'}).includes('hsk-apply-unit'))
console.log('PASS course outline visibility, learner restrictions and reserved print guidance separation')

const optionalTask={id:'optional-writing',skill:'writing',title:'Optional writing',optional:true,prompt:'Optional character practice',minutes:5}
const optionalAttempt={id:'optional-attempt',status:'started',plan_version:1,snapshot:{title:'HSK 1',targetLevel:1,materials:[optionalTask]},answers:{},results:[],observations:[]}
const optionalH={...learnerBase,attemptId:optionalAttempt.id,detail:{...learnerBase.detail,attempts:[optionalAttempt]}}
const optionalHtml=hskPage({hsk:optionalH,workspaceRole:'student'});assert.ok(!optionalHtml.match(/rows="5" required/));assert.ok(optionalHtml.includes('leave blank to skip'))
const skipped={...optionalAttempt,status:'submitted',results:[{taskId:'optional-writing',skill:'writing',skipped:true,needsReview:false,topicIds:[]}]}
const skippedH={...optionalH,detail:{...optionalH.detail,attempts:[skipped]}}
assert.ok(!hskPage({hsk:skippedH,workspaceRole:'tutor'}).includes('name="optional-writing.judgement"'))

const reviewedH={...courseH,detail:{...courseH.detail,plan:{...courseH.detail.plan,course_unit:{id:courseFixture.course.units[0].id}}}}
assert.ok(printablePack(reviewedH,true).includes('Tutor pilot checklist'))
assert.ok(!printablePack(reviewedH,false).includes('Tutor pilot checklist'))
assert.ok(printablePack(reviewedH,false).includes('no minimum-character requirement'))

const earlierPrint={...reviewedH,detail:{...reviewedH.detail,plan:{...reviewedH.detail.plan,bank_version:'earlier-bank'}}}
assert.ok(printablePack(earlierPrint,true).includes('Earlier saved assignment'))
assert.ok(printablePack(earlierPrint,false).includes('retain their original version'))

const hsk2=JSON.parse(readFileSync(new URL('./fixtures/hsk2-course.json',import.meta.url)));
const hsk2Tasks=hsk2.tasks.map(({reference,questions,characterQuestions,...t})=>({...t,...(questions?{questions:questions.map(({answer,...q})=>q)}:{}),...(characterQuestions?{characterQuestions:characterQuestions.map(({answer,...q})=>q)}:{})}));
const hsk2State={...learnerBase,catalogue:{...catalogue,course:{...courseFixture.course,units:[hsk2.unit]}},detail:{...learnerBase.detail,plan:{...plan,target_level:2,course_unit:{id:hsk2.unit.id},materials:hsk2Tasks}},attemptId:'hsk2',responses:{},};
hsk2State.detail.attempts=[{id:'hsk2',plan_version:1,status:'started',snapshot:{title:'HSK 2',targetLevel:2,materials:hsk2Tasks},answers:{},results:[],observations:[]}];
const hsk2Html=hskPage({hsk:hsk2State,workspaceRole:'student'});assert.equal((hsk2Html.match(/Missing character<input/g)||[]).length,5);assert.ok(hsk2Html.includes('maxlength="2" required'));assert.ok(!hsk2Html.includes('Reference:'));assert.ok(!hsk2Html.includes('Tutor-only key evidence'));
const hsk2Print=printablePack(hsk2State);assert.ok(hsk2Print.includes('HSK 2 assessment boundaries'));assert.ok(!hsk2Print.includes('HSK 1 assessment boundaries'));assert.ok(hsk2Print.includes('Session 6'));assert.ok(hsk2Print.includes('not 36 fully authored'));assert.ok(!hsk2Print.includes('Correct answer'));assert.ok(!hsk2Print.includes('Reference:'));
console.log('PASS HSK 2 character inputs, private keys, six session plans and accurate level-specific print boundaries');
