// Coordinates durable Tasks with the existing workflow launcher. The store never
// starts a process: launch intent is committed before this adapter calls the agent.
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import * as T from './tasks.ts';
import * as R from './task-results.ts';
import { read as scalar } from './config-values.ts';
import { detectDefaultAgent, home, readInbox, writeInbox, replaceTask, abandonRun, setArchived, readRuns, readText, saveAttachment, acceptance, gateOf } from './state.ts';

type Hooks = { launch: (state:string, run:string, text:string, task:T.Task, pick?:any) => {ok:boolean; pty?:string; why?:string}; alive:(pty:string)=>boolean; stop:(pty:string)=>boolean; find?:(state:string,run:string)=>string|undefined };
const runtimeLaunches = new Set<string>();
const parse = (file:string) => { try { return JSON.parse(readFileSync(file,'utf8')); } catch { return null; } };
const put = (file:string,value:unknown) => { const temp = file + `.${process.pid}.${randomUUID()}.tmp`; writeFileSync(temp,JSON.stringify(value,null,2)+'\n'); renameSync(temp,file); };
const stableUuid=(key:string)=>{const h=createHash('sha256').update(key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const config = (state:string,key:string,fallback:string) => [join(state,'config.yml'),join(home,'.kaizen','config.yml')].map(f=>{try{return scalar(readText(f),key);}catch{return null;}}).find(x=>x!==null) ?? fallback;
export const taskDefaults = (state:string) => ({ agent: detectDefaultAgent(dirname(state)).name, workflow:config(state,'runner','full'), permissions:'Uses your configured account and tool permissions. Permission requests remain explicit in Technical details.' });
export function resultViews(state:string,id:string) {
  return R.listResults(state,id).map((r:any)=>({...r,createdAt:r.createdAt??r.created,summary:r.summary??'',checks:r.checks??r.validation??[],artifacts:r.artifacts.map((a:any)=>({...a,url:a.url??`/task-artifact?dir=${encodeURIComponent(state)}&task=${id}&result=${r.id}&artifact=${a.id}`,preview:a.preview??'download'}))}));
}
// The one place that says which buttons a task may use; the page only draws this list and taskAction refuses the rest.
const agentKey=(state:string,t:T.Task,hooks?:Hooks)=>t.launch?.pty??(t.activeRun?hooks?.find?.(state,t.activeRun):undefined);
export function allowedActions(state:string,task:T.Task,hooks?:Hooks) {
  const run=runState(state,task),finished=!!run&&(['done','abandoned'].includes(run.stage)||!!run.healed),live=!!task.activeRun&&!!run&&!finished;
  const key=agentKey(state,task,hooks),alive=!!(key&&hooks?.alive(key));
  let accept=false,acceptWhy:string|undefined;
  try{T.acceptTask(structuredClone(task),task.currentResult??'');accept=true;}catch{/* not acceptable now */}
  if(accept&&run&&!finished){accept=false;acceptWhy='The workflow is still reviewing this result';}
  else if(accept&&run?.awaiting&&!run.healed){accept=false;acceptWhy='Resolve the blocking workflow decision first.';}
  return {accept,...(acceptWhy?{acceptWhy}:{}),
    stop:(live&&['draft','waiting','working','ready'].includes(task.status))||(['failed','interrupted','working'].includes(task.status)&&alive),
    // A ready task whose run is still in review but whose agent is gone can only finish by relaunching it.
    resume:(['interrupted','failed','stopping'].includes(task.status)||(task.status==='ready'&&live))&&!alive,
    abandon:live||task.status==='stopping',archive:true,delete:!task.runIds.length&&!task.activeRun,
    start:task.status==='draft'&&!task.activeRun&&!task.currentResult&&!!task.project};
}
export function taskView(state:string,task:T.Task,hooks?:Hooks) {
  const p=T.taskProjection(task);
  const run=runState(state,task), finished=run&&(['done','abandoned'].includes(run.stage)||run.healed);
  return {...task,actions:allowedActions(state,task,hooks),...(hooks?{agentAlive:!!(agentKey(state,task,hooks)&&hooks.alive(agentKey(state,task,hooks)!))}:{}),activeRun:finished&&['ready','accepted'].includes(task.status)?null:task.activeRun,projectName:task.project?.split(/[\\/]/).pop()??'Choose a project',dir:state,updatedAt:task.updated,attention:{category:p.filter,reason:p.reason,action:p.action},statusLabel:p.label,decision:!task.project?{id:'project',kind:'project',text:'Choose a named project for your saved goal.'}:task.pendingDecision,messages:task.events,runs:task.runIds,currentResultId:task.currentResult,acceptedResultId:task.acceptedResult};
}
export function taskList(states:string[],hooks?:Hooks) {
  const tasks=states.flatMap(state=>T.listTasks(state).filter(t=>!t.archived).map(t=>taskView(state,reconcile(state,t,hooks),hooks)));
  // Legacy rows become durable only when opened. Stable keys include stamps/index,
  // never a title-based merge; existing inbox and run files are left intact.
  for(const state of states) {
    const adopted=new Set(T.listTasks(state).map(t=>t.legacyKey));
    for(const run of readRuns(state)) {
      if(adopted.has(`run:${run.id}`)||tasks.some(t=>t.dir===state&&t.runIds.includes(run.id)))continue;
      const goal=readTextSafe(join(state,'runs',run.id,'00-request.md'))?.split('\n').find(l=>l.trim()&&!l.startsWith('#'))??run.id;
      tasks.push({id:`legacy-run-${run.id}`,dir:state,title:goal.slice(0,160),goal,revision:0,updatedAt:run.moved,status:run.stage==='done'?'ready':'working',attention:{category:run.awaiting?'needs-you':['done','abandoned'].includes(run.stage)?'completed':'in-progress',reason:run.awaiting?'This existing task needs your decision.':`Existing work: ${run.stage}`,action:'Open task'},legacy:{kind:'run',id:run.id},runIds:[run.id]} as any);
    }
    readInbox(state).forEach((line:any,index:number)=>{const key=`inbox:${line.added??'legacy'}:${index}`;if(line.status!=='open'||adopted.has(key))return;tasks.push({id:`legacy-inbox-${index}`,dir:state,title:line.text,goal:line.text,revision:0,updatedAt:line.added??0,status:'draft',attention:{category:'needs-you',reason:'Ready to start',action:'Open task'},legacy:{kind:'inbox',index,added:line.added},runIds:[]} as any);});
  }
  const ranks:Record<string,number>={'needs-you':0,'in-progress':1,completed:2};
  return tasks.sort((a,b)=>ranks[a.attention.category]-ranks[b.attention.category]||b.updatedAt-a.updatedAt);
}
const readTextSafe=(f:string)=>{try{return readText(f);}catch{return null;}};
export function reconcile(state:string,task:T.Task,hooks?:Hooks):T.Task {
  let reason='';
  if(T.normalizePause(structuredClone(task)))task=T.mutateTask(state,task.id,{revision:task.revision,opId:`heal:${task.revision}`},t=>{T.normalizePause(t);});
  // The run finished with a saved result and nothing left to apply: the task is ready, whatever became of the agent.
  // Not while its agent is still alive: clearing launch would stop tracking it; the heal runs once it ends.
  if(['working','interrupted'].includes(task.status)&&task.currentResult&&!task.pendingDecision&&task.inputs.every(i=>['applied','failed'].includes(i.state))&&!(hooks&&task.launch?.pty&&hooks.alive(task.launch.pty))){
    const run=runState(state,task);
    if(run&&(run.stage==='done'||run.healed))return T.mutateTask(state,task.id,{revision:task.revision,opId:`finished:${task.revision}`},t=>{t.status='ready';t.safe=true;t.writePhase=false;t.queuePaused=false;t.error=undefined;t.launch=null;T.addEvent(t,'system','finished','The run finished and the saved result is ready to review.');});
  }
  if(task.status==='stopping'&&hooks){
    // Stop is finished when the terminal is gone, or when there is none to wait for. A live one is asked again.
    const key=agentKey(state,task,hooks);
    if(key&&hooks.alive(key)){hooks.stop(key);return task;}
    return T.mutateTask(state,task.id,{revision:task.revision,opId:`stopped:${task.revision}`},t=>stopped(t,key));
  }
  if(task.launch && ['intent','started'].includes(task.launch.phase) && !runtimeLaunches.has(task.launch.id) && hooks && !(task.launch.pty&&hooks.alive(task.launch.pty))) reason='The launch was interrupted before the agent acknowledged it. Review the existing session before resuming.';
  else if(task.status==='working'&&task.launch?.pty&&hooks&&!hooks.alive(task.launch.pty)&&!task.safe)reason='The agent ended before reporting a safe handback. Your requests and previous results are saved.';
  if(reason) return T.mutateTask(state,task.id,{revision:task.revision,opId:`interrupted:${task.launch?.id}`},t=>{T.recoverLaunch(t);t.status='interrupted';t.error=reason;t.queuePaused=true;});
  return task;
}
function stopped(t:T.Task,key?:string) {
  T.confirmStopped(t);
  if(!key)T.addEvent(t,'system','stop-unverified','No agent terminal was found on this board. If the agent runs somewhere else it may still be working. Resume starts a new session.');
}
function runState(state:string,task:T.Task) { return task.activeRun?parse(join(state,'runs',task.activeRun,'state.json')):null; }
export function dispatchReady(state:string,id:string,hooks:Hooks,initial=false,pick?:any):T.Task {
  let task=T.readTask(state,id)!;
  if(task.pendingDecision||task.queuePaused||!task.safe||task.status==='accepted')return task;
  const previous=runState(state,task);
  const finished=!previous||['done','abandoned'].includes(previous.stage);
  const run=finished?`${new Date().toISOString().slice(0,10)}-task-${id.slice(0,8)}-${task.runIds.length+1}`:task.activeRun!;
  let ids:string[]=[];
  task=T.mutateTask(state,id,{revision:task.revision,opId:`dispatch:${task.revision}`},t=>{
    const batch=T.dispatchInputs(t);ids=batch.map(i=>i.id);
    if(!initial&&!batch.length)return;
    const launch=T.beginLaunch(t,ids);launch.run=run;
    t.activeRun=run;if(!t.runIds.includes(run))t.runIds.push(run);
  });
  if(!task.launch||task.launch.phase!=='intent')return task;
  if(finished){
    const folder=join(state,'runs',run);mkdirSync(folder,{recursive:true});
    put(join(folder,'state.json'),{id:run,mode:config(state,'mode','auto'),runner:pick?.kind==='lite'||pick?.kind==='full'?pick.kind:config(state,'runner','full'),agent:pick?.agent||detectDefaultAgent(dirname(state)).cmd,track:'code',stage:'plan',awaiting:null,iteration:0,updated:new Date().toISOString(),task_id:id,task_policy:{requirePlanConfirmation:!task.initialConfirmed},...(task.initialConfirmed?{task_confirmed:{direction:'routine revision',at:Date.now()}}:{})});
    writeFileSync(join(folder,'00-request.md'),(ids.length?task.inputs.filter(i=>ids.includes(i.id)).map(i=>i.text).join('\n\n'):task.goal)+`\n\nTask: ${id}\n`+(previous?`Follow-up of: ${previous.id}\n`:'')+task.files.map(f=>`Reference: ${f.name} (${f.path})`).join('\n'));
  }
  const context=JSON.stringify({task:id,launch:task.launch.id,inputIds:ids,currentResult:task.currentResult,initialConfirmed:task.initialConfirmed});
  const command=`${JSON.stringify(process.execPath)} ${JSON.stringify(join(import.meta.dir,'install.ts'))}`;
  const protocol=join(dirname(import.meta.dir),'skills','kaizen','spec.md');
  const text=`Resume run ${run} for the persistent task. Read its state and request. Task context: ${context}. ${task.initialConfirmed?'Routine revision is authorized; preserve the accepted direction. Material scope changes require a new proposal.':'Perform intake/clarification and planning only. Publish a concise proposal and wait for explicit confirmation before any production, even in auto mode.'} Task protocol source: ${protocol}. Use the current implementation command ${command} task (the globally installed kaizen may be older). First acknowledge this launch with ${command} task event --task ${id} --run ${run} --json '${JSON.stringify({type:'ack',launchId:task.launch.id})}'. Structured event types: ack {launchId}, reply/question/proposal {text,details?,options?}, work {text}, receipt {inputIds,outcome:'applied'|'failed'}, boundary {text}, result {title,summary,artifacts:[{path|url,name?}],checks:[],limitations:[]}. Pass --operation a stable id for replay. A receipt acknowledges only dispatched ids; boundary means no active writes. Publish only settled completed files; never claim registration backend checks from a rendered form. Read the source workflow Task protocol. Inputs: ${task.inputs.filter(i=>ids.includes(i.id)).map(i=>`[${i.id}] ${i.text}`).join('\n')}`;
  runtimeLaunches.add(task.launch.id);
  let outcome;try{
    const selected=detectDefaultAgent(dirname(state)), requested=config(state,'agent.default','auto');
    outcome=!pick?.agent && requested!=='auto' && ![selected.cmd,selected.name].includes(requested) ? {ok:false,why:`Configured agent ${requested} is unavailable. Enable/install it or choose an available default in Settings, then retry. Your goal is saved.`} : hooks.launch(state,run,text,task,pick);
  }catch(e){outcome={ok:false,why:String(e)};}
  task=T.readTask(state,id)!;
  return T.mutateTask(state,id,{revision:task.revision,opId:`launched:${task.launch!.id}`},t=>{if(outcome.ok){if(t.launch!.phase==='intent')t.launch!.phase='started';if(outcome.pty)t.launch!.pty=outcome.pty;}else{t.status='failed';t.error=outcome.why||'Agent could not start. Your goal is saved.';t.launch!.phase='interrupted';t.queuePaused=true;} });
}
export function taskAction(state:string,body:any,hooks:Hooks):{state:string;task:T.Task} {
  const op=String(body.op??'');const operationId=String(body.operationId??'');if(!operationId)throw new T.TaskError('A request id is required',400);
  if(op==='create'){
    const goal=String(body.goal??'').trim();if(goal.length>50000)throw new T.TaskError('Goal is too long',400);
    let task=T.createTask(state,{goal,project:state===join(home,'.kaizen')?null:dirname(state)},operationId);
    if(body.files?.length&&!task.files.length){const files=body.files.map((f:any)=>{if(typeof f.name!=='string'||typeof f.data!=='string'||f.data.length>100_000_000)throw new T.TaskError('Invalid attachment',400);const path=saveAttachment(state,null,f.name,Buffer.from(f.data.replace(/^data:[^,]*,/,''),'base64'));return {name:f.name,path:join(state,path)};});task=T.mutateTask(state,task.id,{revision:task.revision,opId:operationId+':files'},t=>{t.files=files;});}
    if(task.project&&task.runIds.length===0)task=dispatchReady(state,task.id,hooks,true);
    return {state,task};
  }
  if(op==='adopt'){
    const l=body.legacy??{};let goal='',key='';
    if(l.kind==='run'){const run=readRuns(state).find(r=>r.id===l.id);if(!run)throw new T.TaskError('Existing run unavailable',404);key=`run:${run.id}`;goal=readTextSafe(join(state,'runs',run.id,'00-request.md'))??run.id;}else{const line=readInbox(state)[Number(l.index)];if(!line||line.added!==l.added)throw new T.TaskError('Task changed; refresh');key=`inbox:${line.added??'legacy'}:${l.index}`;goal=line.text;}
    let task=T.adoptTask(state,key,{goal,project:dirname(state)});
    if(l.kind==='run'&&!task.activeRun)task=T.mutateTask(state,task.id,{revision:task.revision,opId:`link:${l.id}`},t=>{
      const file=join(state,'runs',l.id,'state.json'),run=parse(file);t.activeRun=l.id;t.runIds=[l.id];
      const finished=run&&['done','abandoned'].includes(run.stage);
      if(finished){
        const report=readTextSafe(join(state,'runs',l.id,'03-impl.md'))??'',preview=/^## Preview[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(report)?.[1]??'';
        const artifacts:R.ArtifactInput[]=[];
        for(const m of preview.matchAll(/!?\[([^\]]*)\]\((attachments\/[^)]+)\)/g))artifacts.push({name:m[1]||undefined,path:join(state,'runs',l.id,m[2])});
        for(const m of preview.matchAll(/https?:\/\/[^\s<>\)]+/g)){const url=R.liveUrl(m[0]);if(url&&!artifacts.some(a=>a.url===url))artifacts.push({url,name:'Existing live preview (mutable)'});}
        if(artifacts.length){
          try{const result=R.publishResult(state,t.id,{runId:l.id,title:'Existing result',summary:'Preserved from the existing run Preview.',artifacts,roots:[dirname(state)],limitations:['Legacy checks are available in Technical details. Live links remain mutable; only copied files are preserved.'],id:stableUuid(`legacy-result:${t.id}:${l.id}`)});t.currentResult=result.id;t.status='ready';t.safe=true;}
          catch(e){t.status='failed';t.error=(e as Error).message;}
        }else{t.status='interrupted';t.error='This earlier run has no typed result or Preview output. Its files and evidence remain in Technical details. Resume to publish a result.';}
      }else{
        const plan=readTextSafe(join(state,'runs',l.id,'01-plan.md'));
        put(file,{...run,task_id:t.id,task_policy:{requirePlanConfirmation:run.awaiting==='approvals.plan'}});
        if(run.awaiting==='approvals.plan'&&plan){t.pendingDecision={id:randomUUID(),kind:'proposal',text:'Review the existing plan before production continues.',details:plan,run:l.id,iteration:run.iteration??0,result:null};t.status='waiting';t.safe=true;}
        else{t.status='interrupted';t.error='Existing work is preserved. Review its current session in Technical details before resuming.';}
      }
    });
    return {state,task};
  }
  const found=T.resolveTask(state,String(body.id??''));if(!found)throw new T.TaskError('Unknown task',404);state=found.state;let task=reconcile(state,found.task,hooks);
  // Reconcile may bump the revision between the page's read and this call; a page that held the revision read just before it is not stale.
  const mutation={revision:Number(body.revision)===found.task.revision&&['stop','abandon','archive'].includes(op)?task.revision:Number(body.revision),opId:operationId};
  if(task.operations.includes(operationId))return {state,task};
  const allowed=allowedActions(state,task,hooks);
  if(op==='start'){task=T.mutateTask(state,task.id,mutation,t=>{if(t.status!=='draft')throw new T.TaskError('Task already started');});return {state,task:dispatchReady(state,task.id,hooks,true,body.pick&&typeof body.pick==='object'?body.pick:undefined)};}
  if(op==='delete'||op==='archive'||op==='abandon'){
    // Closing a task: Delete only before any run exists; Archive hides it; Abandon ends its run.
    if(op==='delete'){
      if(!allowed.delete)throw new T.TaskError('A run already started. Archive or abandon it instead.');
      replaceTask(state,task.goal,null);T.deleteTask(state,task.id);return {state,task};
    }
    if(op==='abandon'&&!task.activeRun)throw new T.TaskError('No run to abandon');
    // Side effects run inside the mutation, after the revision check and under the task lock, so a stale page changes nothing.
    // A run that is already done, already abandoned or gone counts as success: the task is archived either way.
    return {state,task:T.mutateTask(state,task.id,mutation,t=>{
      if(op==='abandon'){
        const run=runState(state,t);
        if(run&&!['done','abandoned'].includes(run.stage)){const key=agentKey(state,t,hooks);if(key&&hooks.alive(key))hooks.stop(key);const bad=abandonRun(state,t.activeRun!,String(body.why??'').trim()||'abandoned from the task page');if(bad)throw new T.TaskError(bad);}
      }else if(t.activeRun)setArchived(state,t.activeRun,true);
      else{const lines=readInbox(state),at=lines.findIndex(l=>l.status==='open'&&l.text===t.goal);if(at>=0){lines[at]={...lines[at]!,status:'archived'};writeInbox(state,lines);}}
      t.archived=true;
    })};
  }
  if(op==='stop'&&!allowed.stop)return {state,task};
  task=T.mutateTask(state,task.id,mutation,t=>{
    if(op==='message'){
      const text=String(body.text??'').trim();const status=body.intent==='question'||/^\s*(status\??|what(?:'s| is) (?:the )?(?:status|progress)\??|how (?:is|are) (?:it|things|the task) (?:going|doing)\??)\s*$/i.test(text);
      if(status){T.receiveInput(t,{id:operationId,text,intent:'status',baseResult:body.baseResultId??null});return;}
      const answer=t.pendingDecision?.kind==='question';
      T.receiveInput(t,{id:operationId,text,intent:answer?'answer':'change',baseResult:body.baseResultId??null});
      if(answer||t.pendingDecision?.kind==='proposal'){t.pendingDecision=null;t.safe=true;t.status='draft';}
    }else if(op==='stop'){T.requestStop(t);}
    else if(op==='resume'){const key=agentKey(state,t,hooks);if(key&&hooks.alive(key))throw new T.TaskError('The existing agent is still alive. Stop it or reconcile it in Technical details before resuming.');if(!allowed.resume)throw new T.TaskError('This task does not need recovery');T.resumeTask(t);}
    else if(op==='accept'){
      if(!allowed.accept)throw new T.TaskError(allowed.acceptWhy??'Finish the active work and pending decisions before accepting this result');
      T.acceptTask(t,String(body.resultId??''));
    }else if(op==='confirm'){
      const d=t.pendingDecision;if(!d||d.kind!=='proposal'||d.id!==body.decisionId||d.run!==t.activeRun||d.result!==t.currentResult)throw new T.TaskError('This proposal changed. Refresh and review it again.');
      const file=join(state,'runs',t.activeRun!,'state.json'),run=parse(file);if(!run||Number(run.iteration??0)!==d.iteration||(run.awaiting!=='approvals.plan'&&run.task_confirmed?.proposal!==d.id))throw new T.TaskError('This run is no longer waiting for this proposal.');
      put(file,{...run,task_confirmed:{proposal:d.id,iteration:d.iteration,at:Date.now()},awaiting:null});
      const approval=join(state,'runs',t.activeRun!,'02-approval.md');writeFileSync(approval,(readTextSafe(approval)??'')+`\nTask proposal ${d.id} explicitly confirmed by user via board at ${new Date().toISOString()}.\n`);
      t.initialConfirmed=true;t.pendingDecision=null;t.safe=true;t.status='draft';T.addEvent(t,'user','confirm','Proposal confirmed.');
      // The same run continues with a durable input receipt.
      T.receiveInput(t,{id:operationId+':continue',text:'The current proposal is confirmed. Continue production under the frozen task policy.',intent:'answer',baseResult:t.currentResult});
    }else throw new T.TaskError('Unknown task action',400);
  });
  if(op==='stop'){
    const key=agentKey(state,task,hooks);
    if(key&&hooks.alive(key))hooks.stop(key);
    else try{task=T.mutateTask(state,task.id,{revision:task.revision,opId:operationId+':stopped'},t=>stopped(t,key));}
    catch{task=T.readTask(state,task.id)!;/* the pump confirmed the stop first: same outcome */}
  }else if(['message','confirm','resume'].includes(op))task=dispatchReady(state,task.id,hooks,op==='resume'&&!task.inputs.some(i=>['queued','received'].includes(i.state)));
  return {state,task};
}

// CLI-only structured events. Raw terminal text is never an acknowledgement.
export function taskEvent(state:string,id:string,runId:string,event:any,operationId:string):T.Task {
  const task=T.readTask(state,id);if(!task||task.activeRun!==runId)throw new T.TaskError('This run does not own the task');
  let preserving=false;
  try { return T.mutateTask(state,id,{revision:task.revision,opId:operationId},t=>{
    const run=runState(state,t);if(!run||run.task_id!==id)throw new T.TaskError('Run task identity does not match');
    if(event.type==='ack'){T.acknowledgeLaunch(t,String(event.launchId),runId,t.launch?.pty);}
    else if(event.type==='reply'){T.addEvent(t,'assistant','reply',String(event.text??''));}
    else if(event.type==='question'||event.type==='proposal'){
      if(!event.text?.trim())throw new T.TaskError('Question/proposal text is required',400);
      t.pendingDecision={id:randomUUID(),kind:event.type,text:String(event.text),run:runId,iteration:run.iteration??0,result:t.currentResult,...(event.details?{details:String(event.details)}:{}),...(Array.isArray(event.options)?{options:event.options.map(String)}:{})};t.status='waiting';t.safe=true;T.addEvent(t,'assistant',event.type,event.text);
      if(t.launch)t.launch.phase='acknowledged';
      if(event.type==='proposal')put(join(state,'runs',runId,'state.json'),{...run,awaiting:'approvals.plan',task_policy:{requirePlanConfirmation:true},task_confirmed:null});
    }else if(event.type==='work'){
      if(run.task_policy?.requirePlanConfirmation&&!run.task_confirmed)throw new T.TaskError('Proposal confirmation is required before production');
      t.safe=false;t.status='working';T.addEvent(t,'assistant','work',String(event.text??'Working on the task'));
    }else if(event.type==='receipt'){T.acknowledgeInputs(t,event.inputIds??[],event.outcome==='failed'?'failed':'applied',event.error);}
    else if(event.type==='boundary'){T.safeBoundary(t,runId,String(event.text??'Work reached a safe boundary'));}
    else if(event.type==='result'){
      if(run.task_policy?.requirePlanConfirmation&&!run.task_confirmed)throw new T.TaskError('Proposal confirmation is required');
      if(t.inputs.some(i=>i.state==='dispatched'))throw new T.TaskError('Acknowledge the dispatched requests before publishing a result');
      preserving=true;const result=R.publishResult(state,id,{...event,runId,iteration:run.iteration??0,roots:[dirname(state),...(typeof run.worktree==='string'?[run.worktree]:[])],id:stableUuid(`${id}:${runId}:${operationId}`)});
      preserving=false;
      // A result that lands while the task is stopping is saved, but the stop stands.
      if(['stopping','interrupted'].includes(t.status)){t.currentResult=result.id;t.acceptedResult=null;T.addEvent(t,'assistant','result',String(event.summary??event.title??'Result ready'));return;}
      t.currentResult=result.id;t.acceptedResult=null;t.status='ready';t.safe=true;t.pendingDecision=null;t.queuePaused=false;t.error=undefined;if(t.launch)t.launch.phase='acknowledged';T.addEvent(t,'assistant','result',String(event.summary??event.title??'Result ready'));
    }else throw new T.TaskError('Unknown task event',400);
  }); } catch (error) {
    if(event.type==='result'){
      const current=T.readTask(state,id)!,disk=preserving&&((error as T.TaskError).status===507||!(error instanceof T.TaskError));
      // Only a failed copy to disk pauses the task. A refused result (unreceipted input, unconfirmed proposal, bad output) is fixed and published again.
      T.mutateTask(state,id,{revision:current.revision,opId:operationId+':preservation-failed'},t=>{
        if(disk){t.error=(error as Error).message;t.status='failed';t.queuePaused=true;T.addEvent(t,'system','preservation-failed',`This result could not be preserved. ${t.error} Earlier saved results remain available.`);}
        else T.addEvent(t,'system','result-refused',`The result was not accepted yet: ${(error as Error).message}. The agent can fix this and publish again.`);
      });
    }
    throw error;
  }
}
