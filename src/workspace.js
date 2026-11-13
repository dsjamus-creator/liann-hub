// Role-specific navigation. Access comes from the backend, never user metadata.
export const WORKSPACE_SECTIONS = {
 tutor:[['overview','Overview','apps'],['calendar','Calendar','calendar'],['people','My Students','figures'],['classroom','Classroom','read'],['authorboard','AuthorBoard','kids'],['setlists','SetLists','library'],['progress','Progress','progress'],['earnings','Earnings','plan'],['profile','Profile','settings']],
 student:[['overview','My Learning','apps'],['lessons','My Lessons','calendar'],['classroom','Classroom','read'],['people','My Tutors','figures'],['practice','Practice','discover'],['setlists','My SetLists','library'],['progress','Progress','progress'],['profile','Profile','settings']],
}
export const workspaceSection=(role,section)=>WORKSPACE_SECTIONS[role]?.some(([id])=>id===section)?section:'overview'
export function workspaceRail(s,{esc,ico}){
 const role=s.workspaceRole==='tutor'?'tutor':'student', section=workspaceSection(role,s.workspaceSection)
 const switcher=(s.workspaceAccess?.roles||[]).length>1?`<label class="workspace-switch">Workspace<select id="workspace-role" aria-label="Workspace">${s.workspaceAccess.roles.map(r=>`<option value="${esc(r)}" ${r===role?'selected':''}>${r==='tutor'?'Tutor':'Student'}</option>`).join('')}</select></label>`:''
 return `<nav class="admin-rail workspace-rail" aria-label="${role==='tutor'?'Tutor':'Student'} workspace"><div class="admin-rail-label">${ico('figures')}<span>${role==='tutor'?'Tutor':'Student'}</span></div>${switcher}${WORKSPACE_SECTIONS[role].map(([id,label,icon])=>`<button class="ritem" data-workspace="${id}" aria-label="${label}" title="${label}" ${s.page==='workspace'&&section===id?'aria-current="page"':''}><span class="ic">${ico(icon)}</span><span class="lbl">${label}</span></button>`).join('')}</nav>`
}
export function workspacePage(s,{esc,progress,library,apps}){
 const role=s.workspaceRole==='tutor'?'tutor':'student',section=workspaceSection(role,s.workspaceSection),record=s.workspaceData?.role===role?s.workspaceData:null,d=record?.data||{},up=d.upcoming||[],past=d.past||[]
 const title=WORKSPACE_SECTIONS[role].find(([id])=>id===section)[1]
 const open=(path,label)=>`<button class="btn" data-workspace-open="${esc(path)}">${esc(label)}</button>`
 const table=(rows,person)=>rows.length?`<ul class="workspace-list">${rows.map(l=>`<li><div><b>${esc(l.topic||'Lesson')}</b><p class="muted">${esc(person(l)||'')} · ${esc(new Date(l.starts_at).toLocaleString())}</p><span class="muted">${esc(l.status||'Scheduled')}</span></div>${up.includes(l)?open('/classroom/?lesson='+encodeURIComponent(l.id),'Join lesson'):''}</li>`).join('')}</ul>`:'<p class="muted">No lessons to show yet.</p>'
 const who=l=>role==='tutor'?l.student:l.tutor
 let body=''
 if(section==='progress' && role==='tutor' && s.learningProgress?.status==='needs_profile') body=`<div class="grid"><div class="c"><h2>${up.length}</h2><p>Upcoming lessons</p></div><div class="c"><h2>${past.length}</h2><p>Past lesson records</p></div><div class="c"><h2>${(d.students||[]).length}</h2><p>Students on your roster</p></div></div><p class="muted">Lesson records describe teaching activity, not learner mastery. Student mastery is shown only through authorised progress sharing in an institution workspace.</p>`
 else if(section==='progress') body=`<p class="muted">Your learning across connected LiANN apps. Mastery is calculated from recorded practice, not lesson attendance.</p>${s.learningProgress?.status==='needs_profile'?`<div class="c"><p>Complete your learner profile to start recording progress.</p>${open('/student#profile','Set up learner profile')}</div>`:progress(s)}`
 else if(section==='setlists') body=library(s)
 else if(section==='practice') body=`<p class="muted">Practise your saved words in a connected app, then revisit Progress to see recorded mastery.</p>${apps({...s,appf:'All'})}`
 else if(section==='authorboard') body=`<div class="c"><h2>Prepare your next lesson</h2><p>Create activities, import materials and save reusable boards in AuthorBoard.</p>${open('/authorboard/','Open AuthorBoard')}</div>`
 else if(section==='profile') body=`<div class="c"><h2>${esc(record?.profile?.full_name||'Your profile')}</h2><p class="muted">Edit your details, learning preferences${role==='tutor'?', subjects and verification information':''} in your authenticated AlongSide profile.</p>${open(role==='tutor'?'/tutor':'/student#profile','Edit profile')}</div>`
 else if(s.workspaceError) body=`<div class="c" role="alert"><p>${esc(s.workspaceError)}</p><button class="btn ghost" id="refresh-workspace">Try again</button></div>`
 else if(s.workspaceLoading) body='<div class="c" role="status">Loading your workspace…</div>'
 else if(!record) body=`<div class="c"><h2>Start your learning journey</h2><p>Complete your learner profile to connect lessons and tutors. Practice and Progress are available from the tabs on the right.</p>${open('/student#profile','Set up learner profile')}</div>`
 else if(section==='overview') body=`<div class="c workspace-next"><h2>${up.length?'Your next lesson':'Ready for your next step'}</h2>${up.length?table(up.slice(0,1),who):'<p class="muted">You have no upcoming lessons.</p>'}${role==='tutor'&&d.bookabilityMessage?`<p class="muted">${esc(d.bookabilityMessage)}</p>`:''}<div class="workspace-actions">${open(role==='tutor'?'/calendar':'/student','Manage lessons')}<button class="btn ghost" data-workspace="progress">View Progress</button></div></div><div class="grid"><div class="c"><h2>${up.length}</h2><p>Upcoming lessons</p></div><div class="c"><h2>${past.length}</h2><p>Past lesson records</p></div></div>`
 else if(section==='calendar'||section==='lessons') body=`<div class="workspace-actions">${open(role==='tutor'?'/calendar':'/student','Manage bookings and rescheduling')}</div><div class="c"><h2>Upcoming lessons</h2>${table(up,who)}</div><div class="c"><h2>Past lessons</h2>${table(past,who)}</div>`
 else if(section==='classroom') body=`<div class="c"><h2>Join your lesson</h2><p class="muted">Whiteboard and MultiBoard are available inside the classroom. Opening a lesson uses the existing lesson access checks.</p>${table(up,who)}</div>`
 else if(section==='people'){
 const people=role==='tutor'?(d.students||[]).map(p=>p.full_name||p.fullName||p.email||'Student'):d.tutors?.length?d.tutors.map(t=>t.full_name):[...new Set([...up,...past].map(l=>l.tutor).filter(Boolean))]
 body=`<div class="c"><h2>${role==='tutor'?'Your student roster':'Your tutors'}</h2>${people.length?`<ul>${people.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`:'<p class="muted">No linked people to show yet.</p>'}${open(role==='tutor'?'/tutor':'/student','Manage '+(role==='tutor'?'students':'lessons'))}</div>`
 }else if(section==='earnings'){
 const e=d.earnings||{},money=p=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((Number(p)||0)/100)
 body=`<div class="grid">${[['Earned',e.earnedPence],['Pending',e.pendingPence],['Refunded',e.refundedPence]].map(([k,v])=>`<div class="c"><h2>${money(v)}</h2><p>${k}</p></div>`).join('')}</div><p class="muted">Accrued lesson amounts, not confirmation of bank payouts. Check AlongSide for the full statement and payment setup.</p>${open('/tutor','Open earnings and payment settings')}`
 }
 return `<div class="workspace-heading"><div><p class="muted">${role==='tutor'?'Tutor workspace':'Student workspace'}</p><h1>${title}</h1></div><button class="btn ghost" id="refresh-workspace">Refresh</button></div>${s.workspaceActionError?`<p class="err" role="alert">${esc(s.workspaceActionError)}</p>`:''}${body}`
}
