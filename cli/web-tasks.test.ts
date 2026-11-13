// Lifecycle integration uses the real task service and existing run state writer;
// launch hooks model acknowledgements rather than treating terminal silence as safe.
import { test, expect } from 'bun:test';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { taskAction,taskEvent,dispatchReady,taskView,reconcile } from './task-service.ts';
import { readTask,mutateTask,addEvent } from './tasks.ts';
import { listResults } from './task-results.ts';
import { setRunState,finishRun } from './state.ts';
function fixture(runner='full') {
 const root=mkdtempSync(join(tmpdir(),'kz-task-life-')),state=join(root,'.kaizen');mkdirSync(state);
 writeFileSync(join(state,'config.yml'),`mode: auto\nrunner: ${runner}\napprovals:\n  review: false\n`);
 let count=0,alive=true;const hooks={launch:()=>({ok:true,pty:`fixture-${++count}`}),alive:()=>alive,stop:()=>{alive=false;return true;}};
 const action=(body:any)=>taskAction(state,body,hooks).task;
 const created=action({op:'create',goal:'Make a community workshop registration website',operationId:'create'});
 const event=(e:any,op=crypto.randomUUID())=>taskEvent(state,created.id,readTask(state,created.id)!.activeRun!,e,op);
 const now=()=>readTask(state,created.id)!;
 const send=(op:string,more:any={})=>action({op,id:created.id,revision:now().revision,operationId:crypto.randomUUID(),...more});
 const ack=()=>event({type:'ack',launchId:now().launch!.id});
 return {root,state,hooks,created,event,now,send,ack,count:()=>count};
}
for(const runner of ['full','lite'])test(`task production gate survives auto/${runner}, questions do not start production, proposal is versioned`,()=>{
 const f=fixture(runner),run=f.now().activeRun!;f.ack();
 expect(setRunState(f.state,run,['stage=build'])).toContain('confirmation');
 expect(finishRun(f.state,run)).toContain('not been confirmed');
 f.event({type:'question',text:'What date and location should the event use?'});
 const count=f.count();f.send('message',{text:'What is the status?',intent:'question',baseResultId:null});expect(f.count()).toBe(count);
 f.send('message',{text:'November 21, city hall',intent:'change',baseResultId:null});expect(f.count()).toBe(count+1);
 f.ack();f.event({type:'receipt',inputIds:f.now().launch!.inputIds});f.event({type:'proposal',text:'Build an event page and registration form. Check keyboard input; registration storage remains a dependency.'});
 const proposal=f.now().pendingDecision!.id;
 expect(()=>f.send('confirm',{decisionId:'stale'})).toThrow('changed');
 f.send('confirm',{decisionId:proposal});f.ack();
 expect(setRunState(f.state,run,['stage=build'])).toBeNull();
 expect(setRunState(f.state,run,['task_policy=null'])).toContain('frozen');
 expect(readFileSync(join(f.state,'config.yml'),'utf8')).toContain('mode: auto');
 expect(()=>f.send('confirm',{decisionId:proposal})).toThrow('changed');
});
test('ordered changes require an acknowledged safe boundary and never dispatch from quiet or duplicate sends',()=>{
 const f=fixture();f.ack();f.event({type:'proposal',text:'Create the workshop page'});f.send('confirm',{decisionId:f.now().pendingDecision!.id});f.ack();
 f.event({type:'receipt',inputIds:f.now().launch!.inputIds});f.event({type:'work',text:'Building the page'});
 const before=f.count();const body={op:'message',id:f.created.id,revision:f.now().revision,operationId:'remove-phone',text:'Remove phone number',intent:'change',baseResultId:null};
 taskAction(f.state,body,f.hooks);taskAction(f.state,body,f.hooks);
 f.send('message',{text:'Add a map',intent:'change',baseResultId:null});
 expect(f.count()).toBe(before);expect(f.now().inputs.filter(i=>i.state==='queued')).toHaveLength(2);
 dispatchReady(f.state,f.created.id,f.hooks);expect(f.count()).toBe(before);
 f.event({type:'boundary',text:'All file writes stopped; ready for next pass'});dispatchReady(f.state,f.created.id,f.hooks);
 expect(f.count()).toBe(before+1);expect(f.now().launch!.inputIds).toHaveLength(2);
 dispatchReady(f.state,f.created.id,f.hooks);expect(f.count()).toBe(before+1);
});
test('Stop confirms process termination, preserves queued ids and explicit resume reconciles ambiguous work',()=>{
 const f=fixture();f.ack();f.send('message',{text:'Add a map',intent:'change',baseResultId:null});const ids=f.now().inputs.map(i=>i.id);
 f.send('stop');expect(f.now().status).toBe('stopping');
 const stopped=reconcile(f.state,f.now(),f.hooks);expect(stopped.status).toBe('interrupted');expect(stopped.queuePaused).toBe(true);
 f.send('resume');expect(f.now().inputs.map(i=>i.id)).toEqual(ids);expect(f.now().status).toBe('working');
});
test('completed output acceptance and later feedback retain task identity and immutable finished run',()=>{
 const f=fixture();f.ack();f.event({type:'proposal',text:'Build the event site'});f.send('confirm',{decisionId:f.now().pendingDecision!.id});f.ack();f.event({type:'receipt',inputIds:f.now().launch!.inputIds});
 const run=f.now().activeRun!;setRunState(f.state,run,['stage=build']);setRunState(f.state,run,['stage=review']);expect(finishRun(f.state,run)).toBeNull();
 writeFileSync(join(f.root,'event.md'),'# Registration\nA rendered form; no backend verified.');
 const publication={type:'result',title:'Event website',summary:'First result',artifacts:[{path:'event.md'}],limitations:['Registration backend unverified'],settleMs:0};
 f.event(publication,'publication');
 // A crash after manifest publication but before the task pointer write replays
 // to the same result id, preserving one saved version.
 let before=f.now();mutateTask(f.state,before.id,{revision:before.revision,opId:'crash-fixture'},t=>{t.operations=t.operations.filter(op=>op!=='publication');t.currentResult=null;t.status='working';});
 f.event(publication,'publication');expect(listResults(f.state,f.created.id)).toHaveLength(1);
 const result=f.now().currentResult!;expect(taskView(f.state,f.now()).activeRun).toBeNull();f.send('accept',{resultId:result});expect(f.now().status).toBe('accepted');
 const finished=readFileSync(join(f.state,'runs',run,'state.json'),'utf8');f.send('message',{text:'Make the button green',intent:'change',baseResultId:result});
 expect(f.now().runIds).toHaveLength(2);expect(f.now().activeRun).not.toBe(run);expect(f.now().id).toBe(f.created.id);expect(readFileSync(join(f.state,'runs',run,'state.json'),'utf8')).toBe(finished);
 expect(()=>f.send('message',{text:'Remove phone',intent:'change',baseResultId:'wrong'})).toThrow('result changed');
});
test('failed launch retains goal, and stale concurrent mutation does not apply feedback',()=>{
 const f=fixture();const stale=f.now().revision;f.ack();expect(()=>taskAction(f.state,{op:'message',id:f.created.id,revision:stale,operationId:'other-tab',text:'Remove phone',intent:'change',baseResultId:null},f.hooks)).toThrow('another window');
 const task=taskAction(f.state,{op:'create',goal:'Write an invitation',operationId:'failed-launch'}, {...f.hooks,launch:()=>({ok:false,why:'Configured agent unavailable'})}).task;
 expect(task.status).toBe('failed');expect(task.goal).toBe('Write an invitation');expect(task.error).toContain('unavailable');
});

test.skipIf(process.platform==='win32')('HTTP task routes enforce origin, exact proposal, registered states and immutable artifact ids',async()=>{
 const {chmodSync,realpathSync}=await import('node:fs');
 const scratch=realpathSync(mkdtempSync(join(tmpdir(),'kz-task-http-'))),project=join(scratch,'Project'),state=join(project,'.kaizen'),bin=join(scratch,'bin');
 for(const d of [state,bin,join(scratch,'.kaizen'),join(scratch,'.claude')])mkdirSync(d,{recursive:true});
 writeFileSync(join(scratch,'.kaizen','projects'),project+'\n');writeFileSync(join(state,'config.yml'),'agent:\n  default: claude\n  launch: card\napprovals:\n  review: false\n');
 writeFileSync(join(bin,'claude'),'#!/bin/sh\ncat > /dev/null\n');chmodSync(join(bin,'claude'),0o755);
 const socket=Bun.listen({hostname:'127.0.0.1',port:0,socket:{data(){}}}),port=socket.port;socket.stop();
 const child=Bun.spawn([process.execPath,join(import.meta.dir,'install.ts'),'web','--foreground','--no-open','--port',String(port)],{cwd:project,env:{...process.env,HOME:scratch,USERPROFILE:scratch,KAIZEN_HOME:join(scratch,'install'),PATH:bin+':'+process.env.PATH},stdout:'ignore',stderr:'ignore'});
 const base=`http://127.0.0.1:${port}`;
 const post=(body:any,origin=base)=>fetch(base+'/task',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({dir:state,...body})});
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base)).ok){ready=true;break}}catch{}await Bun.sleep(50);}expect(ready).toBe(true);
  expect((await post({op:'create',goal:'Attack',operationId:'attack'},'http://evil.example')).status).toBe(403);
  expect((await post({dir:'/tmp/not-registered/.kaizen',op:'create',goal:'Unknown',operationId:'unknown'})).status).toBe(404);
  const response=await post({op:'create',goal:'Build the workshop page',operationId:'http-create'});expect(response.status).toBe(200);const created:any=await response.json(),id=created.task.id;
  let t=readTask(state,id)!;taskEvent(state,id,t.activeRun!,{type:'ack',launchId:t.launch!.id},'http-ack');
  taskEvent(state,id,t.activeRun!,{type:'proposal',text:'Build the page; backend remains unverified'},'http-proposal');t=readTask(state,id)!;
  const legacy=await fetch(base+'/decide',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({dir:state,id:t.activeRun,awaiting:'approvals.plan'})});expect(legacy.status).toBe(409);
  expect((await post({op:'confirm',id,revision:t.revision,operationId:'wrong-confirm',decisionId:'wrong'})).status).toBe(409);
  expect((await post({op:'confirm',id,revision:t.revision,operationId:'right-confirm',decisionId:t.pendingDecision!.id})).status).toBe(200);
  t=readTask(state,id)!;taskEvent(state,id,t.activeRun!,{type:'ack',launchId:t.launch!.id},'http-ack-build');taskEvent(state,id,t.activeRun!,{type:'receipt',inputIds:t.launch!.inputIds},'http-receipt');
  setRunState(state,t.activeRun!,['stage=build']);setRunState(state,t.activeRun!,['stage=review']);expect(finishRun(state,t.activeRun!)).toBeNull();
  writeFileSync(join(project,'result.md'),'# Saved workshop result');writeFileSync(join(project,'unsafe.html'),'<script>fetch("/task",{method:"POST"})</script>');
  taskEvent(state,id,t.activeRun!,{type:'result',title:'Workshop',summary:'Ready',artifacts:[{path:'result.md'},{path:'unsafe.html'}],settleMs:0},'http-result');
  const doc:any=await(await fetch(base+`/task?dir=${encodeURIComponent(state)}&id=${id}`)).json();expect(doc.results).toHaveLength(1);const artifact=doc.results[0].artifacts[0];
  const saved=await fetch(base+artifact.url,{headers:{range:'bytes=0-6'}});expect(saved.status).toBe(206);expect(await saved.text()).toBe('# Saved');
  const html=await fetch(base+doc.results[0].artifacts[1].url);expect(html.headers.get('content-disposition')).toStartWith('attachment;');expect(html.headers.get('content-type')).toBe('application/octet-stream');
  expect((await fetch(base+artifact.url.replace(artifact.id,'../../etc/passwd'))).status).toBe(404);
  expect((await fetch(base+`/task?id=${id}&dir=${encodeURIComponent('/tmp/nope')}`)).status).toBe(404);
  const current=readTask(state,id)!;expect((await post({op:'accept',id,revision:current.revision,operationId:'http-accept',resultId:current.currentResult})).status).toBe(200);
 }finally{child.kill();await child.exited;}
},20000);
test('a started task is archived or abandoned, never deleted',()=>{
 const f=fixture('lite'),run=f.now().activeRun!;
 expect(()=>f.send('delete')).toThrow();
 f.send('abandon',{why:'test'});
 expect(f.now().archived).toBe(true);
 expect(readFileSync(join(f.state,'runs',run,'state.json'),'utf8')).toContain('abandoned');
});
test('delete removes a draft task that has no run',()=>{
 const root=mkdtempSync(join(tmpdir(),'kz-task-del-')),state=join(root,'.kaizen');mkdirSync(state);
 const hooks={launch:()=>({ok:true,pty:'x'}),alive:()=>false,stop:()=>true};
 const t=taskAction(state,{op:'create',goal:'Throw away',operationId:'c'},hooks).task;
 const d=mutateTask(state,t.id,{revision:t.revision,opId:'clear'},x=>{x.runIds=[];x.activeRun=null;});
 taskAction(state,{op:'delete',id:t.id,revision:d.revision,operationId:'d'},hooks);
 expect(readTask(state,t.id)).toBeNull();
});

// Task flow fixes: every status has a way out, and no refused action leaves a task half-changed.
import { utimesSync,existsSync } from 'node:fs';
import { allowedActions } from './task-service.ts';
function flow(){
 const root=mkdtempSync(join(tmpdir(),'kz-task-flow-')),state=join(root,'.kaizen');mkdirSync(state);
 const live=new Set<string>(),seen:{find?:string;stops:string[]}={stops:[]};let n=0,m=0;
 const hooks:any={launch:()=>{const k=`pty-${++n}`;live.add(k);return{ok:true,pty:k};},alive:(k:string)=>live.has(k),stop:(k:string)=>{seen.stops.push(k);live.delete(k);return true;},find:()=>seen.find};
 const op=()=>`op-${++m}`;
 const act=(t:any,o:string,more:any={})=>taskAction(state,{op:o,id:t.id,revision:t.revision,operationId:op(),...more},hooks).task;
 const ev=(t:any,e:any)=>taskEvent(state,t.id,readTask(state,t.id)!.activeRun!,e,op());
 const get=(t:any)=>readTask(state,t.id)!;
 const started=()=>{let t=act({id:'x',revision:0} as any,'create',{goal:'make a thing'});return ev(t,{type:'ack',launchId:t.launch!.id});};
 const confirmed=()=>{let t=started();t=ev(t,{type:'proposal',text:'plan'});act(t,'confirm',{decisionId:t.pendingDecision!.id});t=get(t);return ev(t,{type:'ack',launchId:t.launch!.id});};
 const art=()=>{const f=join(root,`out-${++m}.md`);writeFileSync(f,'x');const old=new Date(Date.now()-60_000);utimesSync(f,old,old);return [{path:f}];};
 const receipt=(t:any)=>ev(t,{type:'receipt',inputIds:t.inputs.map((i:any)=>i.id),outcome:'applied'});
 const result=(t:any)=>ev(t,{type:'result',title:'r',summary:'s',artifacts:art()});
 const stage=(t:any,s:string)=>{const f=join(state,'runs',t.activeRun,'state.json');writeFileSync(f,JSON.stringify({...JSON.parse(readFileSync(f,'utf8')),stage:s}));};
 const edit=(t:any,fn:(x:any)=>void)=>mutateTask(state,t.id,{revision:get(t).revision,opId:op()},fn);
 return {state,hooks,live,seen,act,ev,get,confirmed,receipt,result,stage,edit};
}
test('a refused result does not pause the task; the next good result is acceptable',()=>{
 const f=flow();let t=f.confirmed();
 expect(()=>f.result(t)).toThrow('Acknowledge');
 t=f.get(t);expect(t.status).not.toBe('failed');expect(t.queuePaused).toBe(false);
 t=f.receipt(t);t=f.result(t);f.stage(t,'done');t=f.get(t);
 expect(allowedActions(f.state,t,f.hooks).accept).toBe(true);
 expect(f.act(t,'accept',{resultId:t.currentResult}).status).toBe('accepted');
});
test('reconcile heals a ready task that is still paused with an error',()=>{
 const f=flow();let t=f.confirmed();t=f.receipt(t);t=f.result(t);f.stage(t,'done');
 f.edit(t,x=>{x.queuePaused=true;x.error='old refusal';});
 const healed=reconcile(f.state,f.get(t),f.hooks);
 expect(healed.queuePaused).toBe(false);expect(healed.error).toBeUndefined();expect(healed.status).toBe('ready');
 expect(f.act(healed,'accept',{resultId:healed.currentResult}).status).toBe('accepted');
});
test('a real copy failure still pauses and fails the task, and Retry clears it',()=>{
 const f=flow();let t=f.confirmed();t=f.receipt(t);
 const file=join(f.state,'..','locked.md');writeFileSync(file,'x');const old=new Date(Date.now()-60_000);utimesSync(file,old,old);require('node:fs').chmodSync(file,0o000);
 try{expect(()=>f.ev(t,{type:'result',title:'r',summary:'s',artifacts:[{path:file}]})).toThrow('Could not preserve');}finally{require('node:fs').chmodSync(file,0o600);}
 t=f.get(t);expect(t.status).toBe('failed');expect(t.queuePaused).toBe(true);expect(t.events.some(e=>e.type==='preservation-failed')).toBe(true);
 expect(allowedActions(f.state,t,f.hooks).resume).toBe(false);expect(allowedActions(f.state,t,f.hooks).stop).toBe(true);
 t=f.act(t,'stop');t=f.act(reconcile(f.state,f.get(t),f.hooks),'resume');expect(t.queuePaused).toBe(false);expect(t.error).toBeUndefined();
});
test('Stop with no board terminal ends in interrupted at once, and Resume starts a new launch',()=>{
 const f=flow();let t=f.confirmed();f.edit(t,x=>{delete x.launch.pty;});t=f.get(t);
 t=f.act(t,'stop');expect(t.status).toBe('interrupted');expect(t.events.some(e=>e.type==='stop-unverified')).toBe(true);
 t=f.act(t,'resume');expect(t.status).toBe('working');expect(t.launch?.pty).toBeTruthy();
});
test('a Stopping task with no terminal heals on the next read and Resume or Abandon work from Stopping',()=>{
 const f=flow();let t=f.confirmed();f.edit(t,x=>{delete x.launch.pty;x.status='stopping';x.queuePaused=true;});
 expect(reconcile(f.state,f.get(t),f.hooks).status).toBe('interrupted');
 const g=flow();let u=g.confirmed();g.edit(u,x=>{x.status='stopping';x.queuePaused=true;});u=g.get(u);g.live.clear();
 // pty known but dead: confirmed by reconcile inside the action, then resume is allowed
 expect(g.act(reconcile(g.state,g.get(u),g.hooks),'resume').status).toBe('working');
 const h=flow();let w=h.confirmed();h.edit(w,x=>{x.status='stopping';x.queuePaused=true;});
 expect(allowedActions(h.state,h.get(w),h.hooks).abandon).toBe(true);
 expect(h.act(h.get(w),'abandon').archived).toBe(true);
});
test('Stop on an adopted run with no launch uses the find hook, otherwise says it may still run',()=>{
 const f=flow();let t=f.confirmed();f.edit(t,x=>{x.launch=null;});f.seen.find='found-1';f.live.add('found-1');
 t=f.act(f.get(t),'stop');expect(f.seen.stops).toContain('found-1');expect(t.status).toBe('stopping');
 expect(reconcile(f.state,f.get(t),f.hooks).status).toBe('interrupted');
});
test('a stopping task whose terminal will not die has the kill sent again by reconcile',()=>{
 const f=flow();let t=f.confirmed();const key=t.launch!.pty!;
 f.edit(t,x=>{x.status='stopping';x.queuePaused=true;});f.hooks.stop=(k:string)=>{f.seen.stops.push(k);return false;};
 expect(reconcile(f.state,f.get(t),f.hooks).status).toBe('stopping');expect(f.seen.stops).toEqual([key]);
 f.live.delete(key);expect(reconcile(f.state,f.get(t),f.hooks).status).toBe('interrupted');
});
test('Abandon from a stale page changes nothing; after a refresh it works',()=>{
 const f=flow();let t=f.confirmed();const stale={...t};t=f.ev(t,{type:'work',text:'building'});
 expect(()=>f.act(stale,'abandon')).toThrow('changed');
 expect(JSON.parse(readFileSync(join(f.state,'runs',t.activeRun!,'state.json'),'utf8')).stage).not.toBe('abandoned');expect(f.live.has(t.launch!.pty!)).toBe(true);
 const done=f.act(f.get(t),'abandon');expect(done.archived).toBe(true);expect(f.live.has(t.launch!.pty!)).toBe(false);
});
test('Abandon on a done run, an abandoned run and a missing run folder counts as success',()=>{
 for(const how of ['done','abandoned','missing']){
  const f=flow();const t=f.confirmed();
  if(how==='missing')require('node:fs').rmSync(join(f.state,'runs',t.activeRun!,'state.json'));else f.stage(t,how);
  const before=how==='missing'?null:readFileSync(join(f.state,'runs',t.activeRun!,'state.json'),'utf8');
  const body={op:'abandon',id:t.id,revision:f.get(t).revision,operationId:'same-op'};
  const r=taskAction(f.state,body,f.hooks).task;expect(r.archived).toBe(true);
  expect(taskAction(f.state,body,f.hooks).task.revision).toBe(r.revision);
  if(before)expect(readFileSync(join(f.state,'runs',t.activeRun!,'state.json'),'utf8')).toBe(before);
 }
});
test('Looks good is not offered while the run is in review, and is once the run is done',()=>{
 const f=flow();let t=f.confirmed();t=f.receipt(t);t=f.result(t);f.stage(t,'review');t=f.get(t);
 const a=allowedActions(f.state,t,f.hooks);expect(a.accept).toBe(false);expect(a.acceptWhy).toContain('reviewing');
 expect(()=>f.act(t,'accept',{resultId:t.currentResult})).toThrow('reviewing');
 f.stage(t,'done');expect(allowedActions(f.state,f.get(t),f.hooks).accept).toBe(true);
 f.stage(t,'abandoned');expect(allowedActions(f.state,f.get(t),f.hooks).accept).toBe(true);
});
test('Delete only before any run; a finished run offers Archive only',()=>{
 const f=flow();let t=f.confirmed();f.stage(t,'done');t=f.get(t);
 const a=allowedActions(f.state,t,f.hooks);expect(a.delete).toBe(false);expect(a.abandon).toBe(false);expect(a.archive).toBe(true);
 expect(()=>f.act(t,'delete')).toThrow('Archive or abandon');
 const n=flow();let d=n.confirmed();n.edit(d,x=>{x.activeRun=null;x.runIds=[];x.launch=null;});expect(allowedActions(n.state,n.get(d),n.hooks).delete).toBe(true);
});
test('Stop twice, after the end, or on a ready task with a finished run changes nothing',()=>{
 const f=flow();let t=f.confirmed();t=f.act(t,'stop');expect(t.status).toBe('stopping');
 const again=f.act(t,'stop');expect(again.revision).toBe(f.get(t).revision);
 const g=flow();let u=g.confirmed();g.live.clear();u=g.act(g.get(u),'stop');expect(u.status).toBe('interrupted');const rev=u.revision;expect(g.act(u,'stop').revision).toBe(rev);
 const h=flow();let w=h.confirmed();w=h.receipt(w);w=h.result(w);h.stage(w,'done');w=h.get(w);expect(h.act(w,'stop').status).toBe('ready');
});
test('a page holding the revision read before reconcile is not stale for Abandon; an older one is, and other ops stay strict',()=>{
 const f=flow();let t=f.confirmed();const page=f.get(t);f.live.clear();
 expect(f.act(page,'abandon').archived).toBe(true);
 const g=flow();let u=g.confirmed();const old={...u};u=g.ev(u,{type:'work',text:'x'});g.live.clear();
 expect(()=>g.act(old,'abandon')).toThrow('changed');
 const h=flow();let w=h.confirmed();const seen=h.get(w);h.live.clear();
 expect(()=>h.act(seen,'resume')).toThrow('changed');
 expect(()=>h.act(seen,'message',{text:'hi',intent:'change',baseResultId:null})).toThrow('changed');
});
test('a ready task whose run is in review and whose agent is dead can Resume to finish the review, then be accepted',()=>{
 const f=flow();let t=f.confirmed();t=f.receipt(t);t=f.result(t);f.stage(t,'review');const key=f.get(t).launch!.pty!;
 expect(allowedActions(f.state,f.get(t),f.hooks).resume).toBe(false);
 f.live.delete(key);let v=f.get(t);const a=allowedActions(f.state,v,f.hooks);
 expect(a.resume).toBe(true);expect(a.accept).toBe(false);
 v=f.act(v,'resume');expect(v.status).toBe('working');expect(v.launch?.pty).not.toBe(key);expect(f.live.has(v.launch!.pty!)).toBe(true);
 // the relaunched agent finishes the review and publishes again; the stored result is kept meanwhile
 expect(v.currentResult).toBe(f.get(t).currentResult);
});
test('a stopping task with a live terminal and a finished run can be abandoned, and reconcile keeps re-sending the kill',()=>{
 const f=flow();let t=f.confirmed();f.stage(t,'done');const key=f.get(t).launch!.pty!;
 f.edit(t,x=>{x.status='stopping';x.queuePaused=true;});f.hooks.stop=(k:string)=>{f.seen.stops.push(k);return false;};
 const v=f.get(t),a=allowedActions(f.state,v,f.hooks);expect(a.abandon).toBe(true);
 reconcile(f.state,v,f.hooks);reconcile(f.state,f.get(t),f.hooks);expect(f.seen.stops).toEqual([key,key]);
 expect(f.act(f.get(t),'abandon').archived).toBe(true);
});
test('the 1-second task pump runs reconcile for stopping tasks',async()=>{
 const src=await Bun.file(new URL('./web.ts',import.meta.url)).text();
 expect(src).toMatch(/const taskPump[\s\S]{0,400}task\.status === "stopping"[\s\S]{0,200}taskService\.reconcile\(dir, task, taskHooks\)/);
});
test('a result that lands while the task is stopping is saved and the stop stands',()=>{
 const f=flow();let t=f.confirmed();t=f.receipt(t);t=f.act(t,'stop');
 t=f.result(t);expect(t.currentResult).toBeTruthy();expect(t.status).toBe('stopping');expect(t.queuePaused).toBe(true);
});
test('a working task whose terminal is still alive is not interrupted by a board restart',()=>{
 const f=flow();const t=f.confirmed();expect(reconcile(f.state,f.get(t),f.hooks).status).toBe('working');
});
test('every status offers a way out and no offered action throws',()=>{
 const statuses=['draft','waiting','working','ready','accepted','stopping','interrupted','failed'];
 for(const status of statuses)for(const run of ['none','live','finished'])for(const paused of [false,true])for(const alive of [true,false]){
  if(run==='none'&&status!=='draft')continue; // a started task always has a run
  const f=flow();let t=f.confirmed();t=f.receipt(t);t=f.result(t);const key=f.get(t).launch!.pty!;
  f.edit(t,x=>{x.status=status;x.queuePaused=paused;if(status==='working')x.safe=false;if(status==='waiting')x.pendingDecision={id:'d',kind:'question',text:'q',run:x.activeRun,iteration:0,result:x.currentResult};if(status==='accepted')x.acceptedResult=x.currentResult;});
  if(run==='none')f.edit(t,x=>{x.activeRun=null;x.runIds=[];x.launch=null;});else f.stage(t,run==='live'?'review':'done');
  if(!alive)f.live.delete(key);
  const v=reconcile(f.state,f.get(t),f.hooks),a=allowedActions(f.state,v,f.hooks);
  // Archive and Delete are not ways out. Draft, waiting and accepted leave by a message (or Start); the rest need a button.
  const button=[a.accept,a.stop,a.resume,a.abandon,a.start].some(Boolean);
  if(!['draft','waiting','accepted'].includes(v.status))expect(button,`${status}/${run}/paused=${paused}/alive=${alive} -> ${v.status}`).toBe(true);
  for(const o of ['stop','resume','accept'] as const)if(a[o]){ try{ f.act(v,o,{resultId:v.currentResult}); }catch(e){ expect(String((e as Error).message)).not.toMatch(/recovery|not allowed/); } }
 }
});
test('ready, resume, agent dies after the run is done without a new result: back to ready with Looks good',()=>{
 const f=flow();let t=f.confirmed();t=f.receipt(t);t=f.result(t);f.stage(t,'review');f.live.clear();
 t=f.act(f.get(t),'resume');expect(t.status).toBe('working');
 f.stage(t,'done');f.live.clear();
 const v=reconcile(f.state,f.get(t),f.hooks);
 expect(v.status).toBe('ready');expect(v.runIds.length).toBe(1);expect(allowedActions(f.state,v,f.hooks).accept).toBe(true);
 expect(f.act(v,'accept',{resultId:v.currentResult}).status).toBe('accepted');
 // an interrupted task in the same position heals too, but one with an unapplied input does not
 const g=flow();let u=g.confirmed();u=g.receipt(u);u=g.result(u);g.stage(u,'done');g.edit(u,x=>{x.status='interrupted';x.queuePaused=true;});g.live.clear();
 expect(reconcile(g.state,g.get(u),g.hooks).status).toBe('ready');
 const h=flow();let w=h.confirmed();w=h.receipt(w);w=h.result(w);h.stage(w,'done');h.edit(w,x=>{x.status='interrupted';x.queuePaused=true;x.inputs.push({id:'q',text:'more',intent:'change',at:1,state:'queued',baseResult:null,baseRun:null});});h.live.clear();
 expect(reconcile(h.state,h.get(w),h.hooks).status).toBe('interrupted');
});
test('the finished-run heal waits while the agent is still alive, then runs once it ends',()=>{
 const f=flow();let t=f.confirmed();t=f.receipt(t);t=f.result(t);f.stage(t,'done');
 f.edit(t,x=>{x.status='working';});const key=f.get(t).launch!.pty!;
 expect(f.hooks.alive(key)).toBe(true);
 const alive=reconcile(f.state,f.get(t),f.hooks);
 expect(alive.status).toBe('working');expect(alive.launch?.pty).toBe(key); // still tracked
 f.live.delete(key);
 expect(reconcile(f.state,f.get(t),f.hooks).status).toBe('ready');
});
test('Stop on a dead agent is a success even when the pump confirmed the stop first',()=>{
 const f=flow();let t=f.confirmed();const key=t.launch!.pty!;
 // the agent dies and the pump confirms the stop right after the action requested it, before the action's own confirm write
 const real=f.hooks.alive;let fired=0;
 f.hooks.alive=(k:string)=>{if(!fired&&f.get(t).status==='stopping'){fired++;f.live.delete(key);reconcile(f.state,f.get(t),f.hooks);}return real(k);};
 const r=f.act(t,'stop');expect(fired).toBe(1);expect(r.status).toBe('interrupted');
 expect(f.act(f.get(t),'stop').status).toBe('interrupted');
});
