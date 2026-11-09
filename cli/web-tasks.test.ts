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
