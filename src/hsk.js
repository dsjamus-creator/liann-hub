const stages = [['warmup','Warm-up and retrieval'],['teaching','Teach and model'],['guided','Guided practice'],['independent','Independent practice'],['exitTicket','Exit check']]
const skills = ['listening','reading','speaking','writing','translation']
const label = value => ({needs_support:'Needs support',developing:'Developing',independent:'Independent on this task'}[value] || value[0].toUpperCase()+value.slice(1))
const text = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const when = date => date ? new Date(date).toLocaleString() : ''
const band = level => Number(level)>=7?'7-9':String(level)
const selectedAttempt = h => h.detail?.attempts?.find(a=>a.id===h.attemptId)
const infoFor = (h,level) => h.catalogue?.levels?.find(l=>l.level===Number(level))
const selectedTasks = h => {
 const d=h.draft
 if(!d)return h.detail?.plan?.materials||[]
 return [...(h.detail?.starterMaterials||[]).filter(t=>d.materialIds.includes(t.id)),...d.customTasks.map((t,i)=>({...t,id:'custom-'+(i+1),origin:'Tutor-authored practice'}))]
}
const field = (name,title,value,max=2000,rows=3) => `<label>${text(title)}<textarea name="${text(name)}" maxlength="${max}" rows="${rows}">${text(value)}</textarea></label>`
const note = '<p class="muted hsk-note">Original LiANN practice. Results and tutor observations are not official HSK marks.</p>'

function syllabus(h,level){
 const info=infoFor(h,level)
 if(!info)return ''
 return `<section class="c hsk-syllabus"><p class="hsk-eyebrow">HSK 3.0 · Level ${info.level}${info.level>=7?' · shared advanced syllabus':''}</p><h2>${text(info.competency)}</h2><p>${Number(info.vocabulary).toLocaleString()} words in the cumulative syllabus inventory${info.level>=7?' shared across Levels 7–9':''}. Vocabulary coverage alone does not demonstrate proficiency.</p><details><summary>Official objectives and exam format</summary><ul>${info.objectives.map(o=>`<li><b>${label(o.skill)}:</b> ${text(o.text)} <span class="muted">Syllabus pp. ${text(o.sourcePages)}.</span></li>`).join('')}</ul><h3>Official task groups</h3><ul>${info.taskGroups.map(t=>`<li>${text(t.title)} · printed p. ${Number(t.printedPage)}</li>`).join('')}</ul><p>${text(info.sampleFormat)}</p><p>These starter objectives are paraphrases. Use the official syllabus for the complete task, topic, character and grammar lists.</p><div class="workspace-actions">${(h.catalogue.sources||[]).map(source=>`<a class="btn ghost" href="${text(source.url)}" target="_blank" rel="noopener noreferrer">${text(source.title)}</a>`).join('')}</div></details></section>`
}
function materialBody(task,{teacher=false,reveal=false,answer=null,editable=false}={}){
 const questions=task.questions||[]
 return `<article class="c hsk-task"><p class="hsk-eyebrow">${text(label(task.skill))} · ${Number(task.minutes)} min · ${text(task.origin||'LiANN practice')}</p><h3>${text(task.title)}</h3><p class="followup-text">${text(task.prompt)}</p>${task.passage?`<p class="hsk-passage" lang="${task.skill==='translation'?'en':'zh-CN'}">${text(task.passage)}</p>`:''}${task.audioText?`<button type="button" class="btn ghost" data-hsk-listen="${text(task.id)}">Listen in Mandarin</button><p class="muted" data-hsk-audio-status="${text(task.id)}"></p>${teacher||reveal?`<details><summary>Listening script</summary><p lang="zh-CN" class="hsk-passage">${text(task.audioText)}</p></details>`:''}`:''}
 ${questions.map((q,i)=>`<fieldset class="hsk-question"><legend lang="zh-CN">${text(q.prompt)}</legend>${q.options.map((option,j)=>editable?`<label class="hsk-choice"><input type="radio" name="${text(task.id)}.${i}" value="${j}" ${answer?.choices?.[i]===j?'checked':''} required><span lang="zh-CN">${text(option)}</span></label>`:`<p class="hsk-option" lang="zh-CN">${String.fromCharCode(65+j)}. ${text(option)}${answer?.choices?.[i]===j?' · Your choice':''}${(teacher||reveal)&&q.answer===j?' · Correct answer':''}</p>`).join('')}</fieldset>`).join('')}
 ${!questions.length?(editable?`<label class="hsk-answer">${task.skill==='speaking'?'After speaking with your tutor, write a short reflection here. Your tutor must hear you before assessing your speaking.':'Your response'}<textarea name="${text(task.id)}.text" maxlength="12000" rows="5" required lang="${task.skill==='speaking'?'en':'zh-CN'}">${text(answer?.text)}</textarea></label>`:answer?.text?`<h4>${task.skill==='speaking'?'Learner reflection':'Submitted response'}</h4><p class="followup-text" lang="zh-CN">${text(answer.text)}</p>`:''):''}
 ${task.minCharacters?`<p class="muted">Practice length: at least ${Number(task.minCharacters)} Chinese characters.</p>`:''}
 ${(teacher||reveal)&&task.reference?`<details><summary>${teacher?'Tutor answer guidance':'Reference guidance after submission'}</summary><p class="followup-text">${text(task.reference)}</p></details>`:''}</article>`
}
function planForm(h){
 const d=h.draft,info=infoFor(h,d.targetLevel),available=h.catalogue.materials.filter(t=>t.band===band(d.targetLevel))
 return `<form id="hsk-plan-form" class="c followup-form"><div class="hsk-two"><label>HSK level for this learner<select name="targetLevel" id="hsk-target-level">${h.catalogue.levels.map(l=>`<option value="${l.level}" ${l.level===Number(d.targetLevel)?'selected':''}>Level ${l.level}</option>`).join('')}</select></label><label>Lesson title<input name="title" value="${text(d.title)}" maxlength="160" required></label></div>${field('goal','What will the learner be able to do?',d.goal)}
 <fieldset class="hsk-topic-list"><legend>Official task focus (choose up to 10)</legend>${info.taskGroups.map(t=>`<label class="hsk-choice"><input type="checkbox" name="topicIds" value="${text(t.id)}" ${d.topicIds.includes(t.id)?'checked':''}><span>${text(t.title)} · syllabus p. ${Number(t.printedPage)}</span></label>`).join('')}</fieldset>
 <fieldset><legend>Lesson objectives</legend>${info.objectives.map(o=>`<label class="hsk-choice"><input type="checkbox" name="objectiveIds" value="${text(o.id)}" ${d.objectiveIds.includes(o.id)?'checked':''}><span><b>${label(o.skill)}</b> · ${text(o.text)}</span></label>`).join('')}</fieldset>
 <fieldset><legend>Original practice materials</legend><p class="muted">Choose a small set for this lesson. These are starter activities, not a complete mock paper. Add your own task below for another topic or exam format. Review vocabulary and grammar for your learner before sharing.</p>${available.map(t=>`<label class="hsk-choice"><input type="checkbox" name="materialIds" value="${text(t.id)}" ${d.materialIds.includes(t.id)?'checked':''}><span>${text(t.title)} · ${Number(t.minutes)} min</span></label>`).join('')}</fieldset>
 <h3>Teaching sequence</h3><button class="btn ghost" type="button" id="hsk-scaffold">Fill empty steps with a preparation scaffold</button>${stages.map(([key,title])=>field(key,title,d.stages[key])).join('')}
 <details ${d.customTasks.length?'open':''}><summary>Tutor-authored activities (${d.customTasks.length})</summary><p class="muted">Add original or licensed materials. Tutor-authored responses require tutor review.</p>${d.customTasks.map((t,i)=>`<fieldset><legend>Activity ${i+1}</legend><label>Activity title<input name="custom.${i}.title" value="${text(t.title)}" maxlength="160" required></label><label>Skill<select name="custom.${i}.skill">${skills.filter(s=>Number(d.targetLevel)>=7||s!=='translation').map(s=>`<option value="${s}" ${s===t.skill?'selected':''}>${label(s)}</option>`).join('')}</select></label>${field(`custom.${i}.prompt`,'Instructions',t.prompt,5000)}${field(`custom.${i}.passage`,'Source passage (optional)',t.passage,6000)}${field(`custom.${i}.reference`,'Tutor reference guidance (hidden before submission)',t.reference,6000)}<div class="hsk-two"><label>Practice minutes<input type="number" min="1" max="60" name="custom.${i}.minutes" value="${Number(t.minutes)}" required></label><label>Minimum Chinese characters (0 if not applicable)<input type="number" min="0" max="2000" name="custom.${i}.minCharacters" value="${Number(t.minCharacters)}" required></label></div><button class="btn ghost" type="button" data-hsk-remove-custom="${i}">Remove activity</button></fieldset>`).join('')}<button class="btn ghost" type="button" id="hsk-add-custom" ${d.customTasks.length>=8?'disabled':''}>Add an activity</button></details>
 ${field('privateNotes','Private tutor preparation notes (never shared)',d.privateNotes,4000)}<p class="muted">Sharing sends the goal, teaching sequence and practice tasks to the learner and any currently verified guardian. Answer guidance remains hidden until submission.</p><div class="workspace-actions"><button class="btn ghost" type="submit" data-hsk-status="draft" ${h.busy?'disabled':''}>Save private lesson plan</button><button class="btn" type="submit" data-hsk-status="published" ${h.busy?'disabled':''}>Share plan and assign practice</button><button class="btn ghost" type="button" id="hsk-print">Print preparation pack</button></div></form>
 <section class="sec"><h2>Material preview</h2>${selectedTasks(h).map(t=>`<details class="c hsk-preview"><summary>${text(t.title)}</summary>${materialBody(t,{teacher:true})}</details>`).join('')||'<p class="muted">Select materials to preview their tasks and answer guidance.</p>'}</section>`
}
function attemptView(h,role){
 const a=selectedAttempt(h),p=h.detail.plan,teacher=role==='tutor',learner=role==='student'
 if(!a)return learner&&p?.status==='published'?`<div class="c"><h2>Ready to practise?</h2><p>Responses and tutor feedback are shared with your lesson tutor and any currently verified guardian. Each timed set uses the selected activities’ practice durations; it is not a full HSK mock exam.</p><div class="workspace-actions"><button class="btn" data-hsk-start="practice" ${h.busy?'disabled':''}>Start practice</button><button class="btn ghost" data-hsk-start="timed" ${h.busy?'disabled':''}>Start timed practice</button></div></div>`:''
 const current=p.version===a.plan_version,editable=learner&&a.status==='started'&&current&&p.status==='published',tasks=a.snapshot.materials||[],responses=h.responses[a.id]||a.answers||{}
 const objective=a.results?.filter(r=>r.total)||[],correct=objective.reduce((n,r)=>n+r.correct,0),total=objective.reduce((n,r)=>n+r.total,0),pending=(a.results||[]).filter(r=>r.needsReview&&!a.observations?.some(o=>o.taskId===r.taskId)).length
 const body=tasks.map(t=>materialBody(t,{teacher,reveal:a.status!=='started',answer:responses[t.id],editable})).join('')
 return `<section class="sec"><h2>${a.status==='started'?'Practice in progress':'Practice evidence'} · Level ${Number(a.snapshot.targetLevel)}</h2><p class="muted">${text(a.snapshot.title)} · ${when(a.started_at)} · ${a.mode==='timed'?'Timed practice':'Untimed practice'}${!current?' · Earlier plan revision':''}</p>${a.due_at?`<p class="hsk-timer" role="status" data-hsk-deadline="${text(a.due_at)}">${a.status==='started'?'Practice deadline: '+when(a.due_at):a.overTime?'Submitted after the practice time limit.':'Submitted within the practice time limit.'}</p>`:''}
 ${a.status!=='started'?`<div class="hsk-metrics"><div class="c"><b>${correct}/${total}</b><span>Comprehension answers correct</span></div><div class="c"><b>${pending}</b><span>Tasks awaiting tutor observation</span></div></div>${(a.results||[]).filter(r=>r.belowMinimum).map(r=>`<p class="muted">${text(tasks.find(t=>t.id===r.taskId)?.title)}: ${Number(r.characters)} Chinese characters; practice minimum ${Number(r.minimum)}. This is a length check, not a quality mark.</p>`).join('')}`:''}
 ${editable?`<form id="hsk-response-form" class="followup-form">${body}<button class="btn" ${h.busy?'disabled':''}>Submit practice responses</button></form>`:body}
 ${teacher&&a.status!=='started'?reviewForm(h,a):''}${a.feedback?`<div class="c"><h3>Tutor feedback</h3><p class="followup-text">${text(a.feedback)}</p><h4>Next lesson focus</h4><p class="followup-text">${text(a.next_step)}</p>${(a.observations||[]).map(o=>`<p><b>${text(label(o.skill))}: ${text(label(o.judgement))}</b> · ${text(o.evidence)}</p>`).join('')}</div>`:''}
 ${learner&&a.status!=='started'&&p.status==='published'?'<div class="workspace-actions"><button class="btn ghost" data-hsk-start="practice">Practise this plan again</button><button class="btn ghost" data-hsk-start="timed">Try timed practice</button></div>':''}</section>`
}
function reviewForm(h,a){
 const d=h.reviewDraft||{feedback:a.feedback||'',nextStep:a.next_step||'',observations:a.observations||[]},rubric=h.catalogue.rubric
 return `<form id="hsk-review-form" class="c followup-form"><h3>Formative tutor assessment</h3><p class="muted">${text(rubric.label)}. Save only observations supported by evidence. Leave a task awaiting observation if you have not assessed it.</p><details><summary>LiANN observation descriptors</summary><ul>${Object.values(rubric.judgements).map(t=>`<li>${text(t)}</li>`).join('')}</ul></details>${a.snapshot.materials.map(t=>{const o=d.observations.find(o=>o.taskId===t.id)||{};return `<fieldset><legend>${text(t.title)}</legend><p class="muted">${text(rubric.criteria[t.skill])}</p><label>Observation<select name="${text(t.id)}.judgement"><option value="">Awaiting observation</option>${Object.keys(rubric.judgements).map(j=>`<option value="${j}" ${j===o.judgement?'selected':''}>${text(label(j))}</option>`).join('')}</select></label>${field(t.id+'.evidence','Evidence supporting this observation',o.evidence)}${t.skill==='speaking'?`<label class="hsk-choice"><input type="checkbox" name="${text(t.id)}.observedLive" ${o.observedLive?'checked':''}><span>I heard this learner complete the speaking task.</span></label>`:''}</fieldset>`}).join('')}${field('feedback','Shared feedback for this learner',d.feedback,4000)}${field('nextStep','Next lesson focus',d.nextStep,2000)}<button class="btn" ${h.busy?'disabled':''}>Save and share assessment</button></form>`
}
function detailView(s){
 const h=s.hsk,teacher=s.workspaceRole==='tutor',p=h.detail.plan,info=infoFor(h,h.draft?.targetLevel||p?.target_level||1),lesson=h.detail.lesson
 return `<div class="workspace-actions"><button class="btn ghost" id="hsk-back">Back to ${teacher?'lesson preparation':'HSK practice'}</button></div><div class="hsk-heading"><div><p class="hsk-eyebrow">${text(lesson.student)} · ${when(lesson.starts_at)}</p><h2>${text(p?.title||lesson.topic||'Prepare a lesson')}</h2></div>${p?`<span class="chip">${text(p.status==='published'?'Shared':p.status==='draft'?'Private draft':'Withdrawn')} · v${Number(p.version)}</span>`:''}</div>${syllabus(h,info.level)}${teacher&&h.draft?planForm(h):p?`<div class="c"><h3>Lesson goal</h3><p class="followup-text">${text(p.goal)}</p><details><summary>Lesson sequence</summary>${stages.map(([key,title])=>`<h4>${title}</h4><p class="followup-text">${text(p.stages[key])}</p>`).join('')}</details><div class="workspace-actions"><button class="btn ghost" id="hsk-print">Print ${teacher?'preparation':'practice'} pack</button>${teacher&&p.status==='published'?`<button class="btn ghost" id="hsk-withdraw" ${h.busy?'disabled':''}>Withdraw plan to revise</button>`:''}</div></div>`:'<div class="c">Your tutor has not shared an HSK plan for this lesson yet.</div>'}
 ${(h.detail.attempts||[]).length?`<label class="hsk-attempt-picker">Practice history<select id="hsk-attempt-select">${h.detail.attempts.map(a=>`<option value="${text(a.id)}" ${a.id===h.attemptId?'selected':''}>${text(when(a.started_at))} · ${text(a.status)} · plan v${Number(a.plan_version)}</option>`).join('')}</select></label>`:''}${p?attemptView(h,s.workspaceRole):''}`
}
export function hskProgress(s){
 const h=s.hsk
 if(!h||h.status!=='ok')return ''
 const rows=h.attempts||[]
 if(!rows.length)return '<section class="sec"><h2>HSK learning evidence</h2><div class="c"><p>No submitted HSK practice yet. Your lesson’s HSK level and tasks will appear here after practice is submitted.</p><button class="btn ghost" data-workspace="hsk">Open HSK practice</button></div></section>'
 return `<section class="sec"><h2>HSK learning evidence</h2>${note}<p class="muted">Recent assigned practice, shown by skill. Speaking requires a live tutor observation.</p>${[...new Set(rows.map(a=>a.student_id+'|'+a.target_level))].map(key=>{const group=rows.filter(a=>a.student_id+'|'+a.target_level===key),first=group[0];return `<div class="c"><h3>${text(first.student)} · HSK Level ${Number(first.target_level)}</h3><div class="hsk-evidence-table">${skills.filter(skill=>Number(first.target_level)>=7||skill!=='translation').map(skill=>{
 const results=group.flatMap(a=>(a.results||[]).filter(r=>r.skill===skill)),marked=results.filter(r=>r.total),correct=marked.reduce((n,r)=>n+r.correct,0),total=marked.reduce((n,r)=>n+r.total,0),latest=group.flatMap(a=>(a.observations||[]).filter(o=>o.skill===skill).map(o=>({...o,at:a.reviewed_at}))).sort((a,b)=>new Date(b.at)-new Date(a.at))[0]
 return `<div class="hsk-evidence-row"><b>${label(skill)}</b><span>${results.length} task response${results.length===1?'':'s'}${total?' · '+correct+'/'+total+' answers correct':''}</span><span>${latest?text(label(latest.judgement))+' · '+text(when(latest.at)):'Awaiting tutor observation'}</span></div>`}).join('')}</div><button class="btn ghost" data-hsk-open="${text(first.lesson_id)}">View latest lesson evidence</button></div>`}).join('')}<p class="muted">Showing up to 200 recent submissions. An independent observation applies to that task; repeated performance across different tasks is still needed.</p></section>`
}
export function hskPage(s){
 const h=s.hsk,teacher=s.workspaceRole==='tutor'
 if(!h||h.status==='loading')return '<div class="c" role="status">Loading HSK lesson preparation and practice…</div>'
 if(h.status==='error')return `<div class="c" role="alert">${text(h.error)} <button class="btn ghost" id="hsk-refresh">Try again</button></div>`
 if(!h.catalogue)return '<div class="c">HSK lesson preparation is not available yet.</div>'
 const error=h.error?`<div class="c err" role="alert">${text(h.error)}${h.detail?'<button class="btn ghost" id="hsk-reload-detail">Reload saved plan</button>':''}</div>`:''
 if(h.detailLoading)return error+'<div class="c" role="status">Loading this lesson plan…</div>'
 if(h.detail)return error+detailView(s)
 const assessment=s.workspaceSection==='assessment',lessons=(h.lessons||[]).filter(l=>teacher||l.plan_status==='published')
 return `${error}<div class="c hsk-intro"><p class="hsk-eyebrow">Prepare · practise · review</p><h2>${teacher?(assessment?'Assessment and next steps':'Plan a lesson around your learner'):'Your HSK practice'}</h2><p>${teacher?'Choose a lesson, set the learner’s level, prepare activities and share a clear learning goal. Review responses using evidence from that lesson.':'Open a tutor-assigned plan to practise, submit your work and see the next steps your tutor recommends.'}</p>${note}</div>${assessment?`<section class="sec"><h2>Recent submissions</h2>${(h.attempts||[]).map(a=>`<div class="c"><p class="hsk-eyebrow">${text(a.student)} · Level ${Number(a.target_level)}</p><p>${when(a.submitted_at)} · ${a.status==='reviewed'?'Reviewed':'Awaiting assessment'}</p><button class="btn ghost" data-hsk-open="${text(a.lesson_id)}" data-hsk-attempt="${text(a.id)}">Review submitted practice</button></div>`).join('')||'<div class="c">No submitted practice to assess yet.</div>'}</section>`:`<section class="sec"><h2>${teacher?'Choose a lesson':'Assigned lesson plans'}</h2><div class="grid">${lessons.map(l=>`<article class="c"><p class="hsk-eyebrow">${text(teacher?l.student:l.tutor)} · ${when(l.starts_at)}</p><h3>${text(l.plan_title||l.topic||'Lesson')}</h3><p class="muted">${l.target_level?'HSK Level '+Number(l.target_level)+' · ':''}${text(l.plan_status||'No HSK plan yet')}</p><button class="btn" data-hsk-open="${text(l.id)}">${teacher?'Prepare lesson':'Open practice'}</button></article>`).join('')||'<div class="c">'+(teacher?'Book or link a lesson with a learner to prepare an individual HSK plan.':'Your tutor has not shared an HSK lesson plan yet.')+'</div>'}</div></section>`}<section class="sec"><label class="hsk-attempt-picker">Explore the syllabus<select id="hsk-explore-level">${h.catalogue.levels.map(l=>`<option value="${l.level}" ${l.level===Number(h.exploreLevel||1)?'selected':''}>HSK Level ${l.level}</option>`).join('')}</select></label>${syllabus(h,h.exploreLevel||1)}</section>`
}

// Printable packs are generated from the role-filtered API response. Learner packs
// never include teacher keys from an unsubmitted attempt or private preparation notes.
export function printablePack(h,teacher=false){
 const p=h.detail?.plan,d=h.draft,level=Number(d?.targetLevel||p?.target_level||1),tasks=selectedTasks(h),info=infoFor(h,level)
 return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${text(d?.title||p?.title||'HSK practice pack')}</title><style>body{font:15px/1.6 Arial,sans-serif;color:#222;max-width:850px;margin:32px auto;padding:20px}h1,h2,h3{color:#284937}.c,fieldset{border:1px solid #ccd4cd;padding:18px;margin:18px 0;break-inside:avoid}.hsk-eyebrow,.muted{color:#555;font-size:13px}.hsk-passage,.followup-text{white-space:pre-wrap}button{display:none}summary{font-weight:bold}details{display:block}details>*{display:block}.answer-space{height:120px;border-bottom:1px solid #aaa}@page{size:A4;margin:16mm}</style><h1>${text(d?.title||p?.title||'HSK practice pack')}</h1><p>HSK 3.0 · Level ${level} · ${teacher?'Tutor preparation pack':'Learner practice pack'} · ${text(h.detail.lesson.student)}</p><p>${text(info?.competency)}</p><h2>Learning goal</h2><p>${text(d?.goal||p?.goal)}</p>${teacher?`<h2>Teaching sequence</h2>${stages.map(([key,title])=>`<h3>${title}</h3><p class="followup-text">${text((d?.stages||p?.stages||{})[key])}</p>`).join('')}`:''}${note}${tasks.map(t=>materialBody(t,{teacher})+'<div class="answer-space"></div>').join('')}<h2>Assessment guidance</h2><p>${text(h.catalogue.rubric.label)}</p><ul>${Object.values(h.catalogue.rubric.judgements).map(v=>`<li>${text(v)}</li>`).join('')}</ul><p>Speaking must be heard by the tutor. Writing length checks are not quality marks.</p><h2>Official sources</h2>${h.catalogue.sources.map(source=>`<p><a href="${text(source.url)}">${text(source.title)}</a></p>`).join('')}<p>Representative original practice; not a complete syllabus or an official mock examination. Syllabus task pages ${text(info?.taskPages)}. Prepared ${text(new Date().toLocaleDateString())}.</p></html>`
}
function draftFor(h){
 const p=h.detail?.plan
 return {targetLevel:p?.target_level||h.detail.recommendedLevel||1,title:p?.title||h.detail.lesson.topic||'HSK lesson',goal:p?.goal||'',objectiveIds:p?.objective_ids||[],topicIds:p?.topic_ids||[],stages:p?.stages||Object.fromEntries(stages.map(([k])=>[k,''])),privateNotes:p?.private_notes||'',materialIds:(p?.materials||[]).filter(t=>!t.id.startsWith('custom-')).map(t=>t.id),customTasks:(p?.materials||[]).filter(t=>t.id.startsWith('custom-')).map(t=>({...t})),version:p?.version||0}
}
const messages={hsk_changed_reload:'This plan or assessment changed in another tab. Reload before saving.',complete_plan_before_sharing:'Add a learning goal, an official task focus, a skill objective, a teaching step, an exit check and at least one practice activity before sharing.',select_material_objectives:'Select the objectives for each chosen activity.',withdraw_before_editing:'Withdraw the shared plan before editing it.',hear_speaking_before_rating:'Hear the learner complete the speaking task before recording that observation.',complete_all_tasks:'Complete each activity before submitting. For speaking, add a reflection after the live task.',hsk_assignment_changed:'Your tutor changed this assignment. Reopen the latest plan before starting again.',resume_existing_attempt:'Resume the practice already in progress for this plan.',not_your_lesson:'You no longer have access to this lesson.',invalid_text:'Check that required text is complete and within the length limits.',hsk_unavailable:'HSK lesson preparation is temporarily unavailable. Please try again.'}
export function createHskController({state,account,render}){
 let generation=0,listRequest=0,detailRequest=0,timer=null
 const current=()=>({generation,user:state.user,role:state.workspaceRole,learner:state.learner?.id})
 const same=c=>c.generation===generation&&c.user===state.user&&c.role===state.workspaceRole&&c.learner===state.learner?.id&&!state.institutional
 function reset(){generation++;listRequest++;detailRequest++;state.hsk=null;clearInterval(timer);globalThis.speechSynthesis?.cancel()}
 async function load(){
  const c=current(),request=++listRequest
  if(!state.workspaceAccess?.roles?.includes(c.role)||state.learner||state.institutional)return
  if(!state.hsk)state.hsk={status:'loading',responses:{}}
  render()
  try{const result=await account.hskRequest('?role='+c.role);if(!same(c)||request!==listRequest)return;Object.assign(state.hsk,result,{status:'ok'})}
  catch(e){if(!same(c)||request!==listRequest)return;Object.assign(state.hsk,{status:'error',error:messages[e.code]||e.message})}
  render()
 }
 async function open(lessonId,attemptId){
  const c=current(),request=++detailRequest,h=state.hsk
  if(!h||h.busy)return
  h.detailLoading=true;h.error='';h.draft=null;h.reviewDraft=null;render()
  try{const result=await account.hskRequest('/plans/'+lessonId);if(!same(c)||request!==detailRequest)return;h.detail=result;h.detailLoading=false;h.attemptId=attemptId||result.attempts?.find(a=>a.status==='started'&&a.plan_version===result.plan?.version)?.id||result.attempts?.[0]?.id;h.draft=c.role==='tutor'&&result.plan?.status!=='published'?draftFor(h):null}
  catch(e){if(!same(c)||request!==detailRequest)return;h.detailLoading=false;h.error=messages[e.code]||e.message}
  render()
 }
 async function mutate(path,body,after){
  const c=current(),h=state.hsk;if(!h||h.busy)return
  h.busy=true;h.error='';render()
  try{const result=await account.hskRequest(path,body);if(!same(c))return;h.busy=false;await after(result);if(same(c))load()}
  catch(e){if(!same(c))return;h.busy=false;h.error=messages[e.code]||e.message;render()}
 }
 function capturePlan(form){
  const h=state.hsk,d=h.draft,f=new FormData(form)
  d.targetLevel=Number(f.get('targetLevel'));d.title=f.get('title');d.goal=f.get('goal');d.privateNotes=f.get('privateNotes');d.materialIds=f.getAll('materialIds');d.objectiveIds=f.getAll('objectiveIds');d.topicIds=f.getAll('topicIds');d.stages=Object.fromEntries(stages.map(([k])=>[k,f.get(k)||'']))
  d.customTasks=d.customTasks.map((_,i)=>Object.fromEntries(['title','skill','prompt','passage','reference','minutes','minCharacters'].map(k=>[k,['minutes','minCharacters'].includes(k)?Number(f.get(`custom.${i}.${k}`)):f.get(`custom.${i}.${k}`)||''])))
 }
 function captureResponses(form){
  const h=state.hsk,a=selectedAttempt(h),f=new FormData(form)
  h.responses[a.id]=Object.fromEntries(a.snapshot.materials.map(t=>[t.id,t.questions?.length?{choices:t.questions.map((_,i)=>f.has(t.id+'.'+i)?Number(f.get(t.id+'.'+i)):null)}:{text:f.get(t.id+'.text')||''}]))
 }
 function captureReview(form){
  const h=state.hsk,a=selectedAttempt(h),f=new FormData(form)
  h.reviewDraft={feedback:f.get('feedback'),nextStep:f.get('nextStep'),observations:a.snapshot.materials.filter(t=>f.get(t.id+'.judgement')).map(t=>({taskId:t.id,judgement:f.get(t.id+'.judgement'),evidence:f.get(t.id+'.evidence')||'',observedLive:f.has(t.id+'.observedLive')}))}
 }
 function bind(){
  clearInterval(timer)
  const h=state.hsk,$=id=>document.getElementById(id)
  document.querySelectorAll('[data-hsk-open]').forEach(b=>{b.onclick=()=>{state.followupDetail=null;state.workspaceSection=state.workspaceRole==='tutor'?(b.dataset.hskAttempt?'assessment':'preparation'):'hsk';state.page='workspace';history.replaceState(null,'','#workspace/'+state.workspaceRole+'/'+state.workspaceSection);open(b.dataset.hskOpen,b.dataset.hskAttempt)}})
  if($('hsk-refresh'))$('hsk-refresh').onclick=()=>{reset();load()}
  if(!h)return
  if($('hsk-reload-detail'))$('hsk-reload-detail').onclick=()=>open(h.detail.lesson.id,h.attemptId)
  if($('hsk-back'))$('hsk-back').onclick=()=>{detailRequest++;h.detail=null;h.draft=null;h.error='';h.reviewDraft=null;globalThis.speechSynthesis?.cancel();render()}
  if($('hsk-explore-level'))$('hsk-explore-level').onchange=e=>{h.exploreLevel=Number(e.target.value);render()}
  const plan=$('hsk-plan-form')
  if(plan){
   plan.oninput=()=>capturePlan(plan)
   plan.onchange=e=>{capturePlan(plan);if(e.target.id==='hsk-target-level'){h.draft.materialIds=[];h.draft.objectiveIds=[];h.draft.topicIds=[];h.draft.customTasks=[]}if(e.target.matches('select,input[type=checkbox]'))render()}
   plan.onsubmit=e=>{e.preventDefault();capturePlan(plan);mutate('/plans/'+h.detail.lesson.id,{...h.draft,status:e.submitter?.dataset.hskStatus||'draft'},()=>open(h.detail.lesson.id))}
  }
  if($('hsk-add-custom'))$('hsk-add-custom').onclick=()=>{capturePlan(plan);h.draft.customTasks.push({title:'',skill:'writing',prompt:'',passage:'',reference:'',minutes:10,minCharacters:0});render()}
  if($('hsk-scaffold'))$('hsk-scaffold').onclick=()=>{
   capturePlan(plan)
   const suggestions={warmup:'Retrieve familiar words and sentence patterns. Ask two short questions to check prior knowledge.',teaching:'Model the target task. Explain key language, demonstrate one response and check understanding.',guided:'Complete a parallel example together. Reduce prompts as the learner becomes more confident.',independent:'Ask the learner to complete the selected practice activities independently. Record any help provided.',exitTicket:'Ask the learner to complete one new example of the lesson objective without prompting. Record evidence and one next step.'}
   for(const [key,value] of Object.entries(suggestions))if(!h.draft.stages[key])h.draft.stages[key]=value
   render()
  }
  document.querySelectorAll('[data-hsk-remove-custom]').forEach(b=>{b.onclick=()=>{capturePlan(plan);h.draft.customTasks.splice(Number(b.dataset.hskRemoveCustom),1);render()}})
  if($('hsk-withdraw'))$('hsk-withdraw').onclick=()=>{if(confirm('Withdraw this plan before revising it? Learners cannot submit practice against a withdrawn plan.'))mutate('/plans/'+h.detail.lesson.id+'/withdraw',{version:h.detail.plan.version},()=>open(h.detail.lesson.id))}
  document.querySelectorAll('[data-hsk-start]').forEach(b=>{b.onclick=()=>{const attemptId=h.pendingStart?.mode===b.dataset.hskStart?h.pendingStart.id:crypto.randomUUID();h.pendingStart={id:attemptId,mode:b.dataset.hskStart};mutate('/plans/'+h.detail.lesson.id+'/start',{attemptId,mode:b.dataset.hskStart},async result=>{h.pendingStart=null;await open(h.detail.lesson.id,result.attempt.id)})}})
  if($('hsk-attempt-select'))$('hsk-attempt-select').onchange=e=>{h.attemptId=e.target.value;h.reviewDraft=null;render()}
  const response=$('hsk-response-form')
  if(response){response.oninput=()=>captureResponses(response);response.onsubmit=e=>{e.preventDefault();captureResponses(response);const a=selectedAttempt(h);mutate('/attempts/'+a.id+'/submit',{answers:h.responses[a.id]},()=>open(h.detail.lesson.id,a.id))}}
  const review=$('hsk-review-form')
  if(review){review.oninput=()=>captureReview(review);review.onsubmit=e=>{e.preventDefault();captureReview(review);const a=selectedAttempt(h);mutate('/attempts/'+a.id+'/review',{...h.reviewDraft,version:a.version},()=>open(h.detail.lesson.id,a.id))}}
  if($('hsk-print'))$('hsk-print').onclick=()=>{
   if(plan)capturePlan(plan)
   const tab=window.open('','_blank');if(!tab){h.error='Allow a new tab to print the lesson pack.';return render()}
   tab.opener=null;tab.document.open();tab.document.write(printablePack(h,state.workspaceRole==='tutor'));tab.document.close();tab.focus();tab.print()
  }
  document.querySelectorAll('[data-hsk-listen]').forEach(b=>{b.onclick=()=>{
   const task=[...selectedTasks(h),...(selectedAttempt(h)?.snapshot.materials||[])].find(t=>t.id===b.dataset.hskListen),status=document.querySelector(`[data-hsk-audio-status="${b.dataset.hskListen}"]`)
   const synth=globalThis.speechSynthesis,voice=synth?.getVoices().find(v=>/^zh(?:-|_)(?:CN|SG|Hans)/i.test(v.lang))||synth?.getVoices().find(v=>/^zh/i.test(v.lang))
   if(!synth||!voice){if(status)status.textContent='No Mandarin device voice is available. Ask your tutor to read the script from their preparation pack.';return}
   synth.cancel();const utterance=new SpeechSynthesisUtterance(task.audioText);utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=.85;synth.speak(utterance);if(status)status.textContent='Playing device-generated Mandarin. You can listen again.'
  }})
  const deadline=document.querySelector('[data-hsk-deadline]'),a=selectedAttempt(h)
  if(deadline&&a?.status==='started'){
   const tick=()=>{const seconds=Math.ceil((new Date(deadline.dataset.hskDeadline).getTime()-Date.now())/1000);deadline.textContent=seconds>0?`Practice time remaining: ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Practice time limit reached. You can still submit; your result will be marked as over time.'}
   tick();timer=setInterval(tick,1000)
  }
 }
 function navigate(section){
  clearInterval(timer);globalThis.speechSynthesis?.cancel()
  if(state.hsk&&['preparation','assessment','hsk'].includes(section)&&section!==state.workspaceSection){detailRequest++;Object.assign(state.hsk,{detail:null,draft:null,reviewDraft:null,detailLoading:false,error:''})}
 }
 return {load,reset,bind,navigate}
}
