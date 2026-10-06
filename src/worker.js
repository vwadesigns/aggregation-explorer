/* A single serialized pump owns the solver. UI messages only change intent. */
'use strict';
const C=AggregationCore;
let solver=null,initial=null,cache=null,pendingInit=null,runId=0,target=0;
let busy=false,scheduled=false,renderWanted=false,halted=false,lastSend=0,maximum=0;
let view={threshold:3,invert:false},requestId=0,checkpointEvery=1,engineNotice='';
function schedule(){if(!scheduled&&!busy){scheduled=true;setTimeout(pump,0);}}
self.onmessage=e=>{
  const m=e.data;
  if(m.type==='init'){pendingInit=m;halted=false;schedule();return;}
  if(m.runId!==runId)return;
  if(m.type==='seek'&&initial){target=Math.max(0,Math.round(m.time/initial.dt));requestId=m.requestId;renderWanted=true;halted=false;}
  if(m.type==='stop'&&solver){target=solver.step;requestId=m.requestId;renderWanted=true;}
  if(m.type==='view'){view={...view,...m.view};renderWanted=true;}
  if(m.type==='inspect'){renderWanted=true;}
  schedule();
};
async function send(data,force=false) {
  if(!solver||pendingInit)return;
  const stats=C.inspect(data,initial.nx,initial.ny,view.threshold,initial.config.boundary,true);
  stats.drift=(stats.mass-initial.initialMass)/initial.initialMass;
  if(Math.abs(stats.drift)>0.01)throw new Error('Material-balance drift exceeded 1%. The run was stopped rather than renormalized. Use Fine time steps / a shorter run.');
  const payload={type:'frame',runId,requestId,step:solver.step,time:solver.step*initial.dt,
    targetTime:target*initial.dt,dt:initial.dt,done:solver.step===target,
    nx:initial.nx,ny:initial.ny,backend:solver.backend,description:solver.description||'',engineNotice,
    maxTime:maximum*initial.dt,cacheTimes:cache.keys().map(s=>s*initial.dt),
    cacheBytes:cache.map.size*data.byteLength,initialMass:initial.initialMass,stats,data};
  self.postMessage(payload,[data.buffer]);lastSend=performance.now();renderWanted=false;
}
async function pump() {
  scheduled=false;if(busy)return;busy=true;
  try {
    if(pendingInit) {
      const m=pendingInit;pendingInit=null;
      if(solver)solver.dispose();solver=null;initial=null;cache=null;
      runId=m.runId;requestId=m.requestId||0;view={threshold:3,invert:false,...m.view};
      initial=C.initialize(m.config);maximum=0;lastSend=0;engineNotice='';
      if(initial.config.backend!=='cpu') {
        try {solver=await AggregationGPU.GPUSolver.create(initial);}
        catch(e){if(initial.config.backend==='gpu')throw e;engineNotice=`CPU fallback: ${e.message}`;solver=new C.CPUSolver(initial);}
      } else solver=new C.CPUSolver(initial);
      if(pendingInit)return;
      cache=new C.CheckpointCache(initial.data.byteLength);cache.put(0,initial.data);
      checkpointEvery=Math.max(1,Math.round(4/initial.dt));
      target=Math.max(0,Math.round((m.time||0)/initial.dt));renderWanted=true;halted=false;
      self.postMessage({type:'ready',runId,dt:initial.dt,nx:initial.nx,ny:initial.ny,
        backend:solver.backend,config:initial.config,engineNotice,patchCount:initial.patchCount});
      await send(initial.data.slice(),true);
      return;
    }
    if(!solver||halted)return;
    const best=cache.best(target);
    if(best && (solver.step>target || (best.step>solver.step && best.step<=target))) {
      solver.restore(best.data,best.step);renderWanted=true;
    }
    if(solver.step<target) {
      const nextCheckpoint=(Math.floor(solver.step/checkpointEvery)+1)*checkpointEvery;
      const batch=Math.min(target-solver.step,nextCheckpoint-solver.step,solver.backend==='gpu'?128:32);
      await solver.advance(batch);maximum=Math.max(maximum,solver.step);
      const atCheckpoint=solver.step%checkpointEvery===0;
      const due=performance.now()-lastSend>110||solver.step===target;
      if(atCheckpoint||due) {
        const data=await solver.read();
        // Integrity checks do not depend on display threshold.
        C.inspect(data,initial.nx,initial.ny,view.threshold,initial.config.boundary,false);
        if(atCheckpoint)cache.put(solver.step,data);
        if(due)await send(data,true);
      }
    } else if(renderWanted) await send(await solver.read(),true);
  } catch(e) {
    halted=true;if(solver)target=solver.step;
    self.postMessage({type:'error',runId,message:e.message||String(e)});
  } finally {
    busy=false;
    if(pendingInit||(!halted&&solver&&(solver.step!==target||renderWanted)))schedule();
  }
}
