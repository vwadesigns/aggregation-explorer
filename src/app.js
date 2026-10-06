(function(){
  'use strict';
  const C=AggregationCore,$=id=>document.getElementById(id);
  const CONFIG_IDS=['seed','resolution','aspect','length','radius','coverage','variation','irregularity','total','a','b','da','db','boundary','accuracy','backend'];
  const STR_IDS=new Set(['boundary','accuracy','backend']);
  let config={...C.DEFAULTS},view={threshold:3,invert:false},horizon=512,runId=0,requestId=0,ready=false;
  let frame=null,playing=false,playTimer=null,changeTimer=null,paintPending=false,bookmarks=[],fatal=false,exporting=false;
  const workerURL=URL.createObjectURL(new Blob([
    $('core-code').textContent+'\n'+$('gpu-code').textContent+'\n'+$('worker-code').textContent
  ],{type:'text/javascript'}));
  let worker;
  try {worker=new Worker(workerURL);} catch(e){showNotice(`The simulation worker could not start: ${e.message}. Use the included local launcher.`,true);return;}
  URL.revokeObjectURL(workerURL);
  const canvas=$('preview'),context=canvas.getContext('2d',{alpha:false});
  function showNotice(message,error=false){$('notice').hidden=!message;$('notice').textContent=message;$('notice').classList.toggle('error',error);}
  function fmt(n,d=2){return Number(n).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});}
  function timeAt(v){return Math.expm1(Number(v)/1000*Math.log1p(horizon));}
  function sliderAt(t){return Math.log1p(Math.max(0,t))/Math.log1p(horizon)*1000;}
  function updateOutputs(){
    $('radiusValue').textContent=Number($('radius').value).toFixed(1);
    for(const id of ['coverage','variation','irregularity'])$(id+'Value').textContent=Math.round(Number($(id).value)*100)+'%';
    $('thresholdValue').textContent=Number($('threshold').value).toFixed(2);
  }
  function writeControls(c){for(const id of CONFIG_IDS)$(id).value=String(c[id]);updateOutputs();setInitControls();}
  function setInitControls(){const ref=$('preset').value==='reference';for(const k of ['radius','coverage','variation','irregularity'])$(k).disabled=ref;}
  function readControls(){const c={...config};for(const id of CONFIG_IDS)c[id]=STR_IDS.has(id)?$(id).value:Number($(id).value);c.init=$('preset').value==='reference'?'perturbations':'patches';return C.validate(c);}
  function setBusy(b){
    $('exportButton').disabled=b||!frame||fatal||exporting;$('saveSetup').disabled=b||!frame||fatal;$('pinButton').disabled=b||!frame||fatal;
    $('cancelButton').disabled=!b||!ready||fatal;
  }
  function stopPlay(){playing=false;clearTimeout(playTimer);$('playButton').textContent='Play';}
  function reset(c,time=0,keepPins=false){
    try{C.validate(c);}catch(e){showNotice('Settings not applied: '+e.message,true);return;}
    clearTimeout(changeTimer);stopPlay();config={...c};runId++;requestId++;ready=false;frame=null;fatal=false;
    if(!keepPins){bookmarks=[];renderPins();}
    $('evolution').disabled=true;$('playButton').disabled=true;$('resetButton').disabled=true;$('endButton').disabled=true;
    $('evolution').value=sliderAt(time);$('timeInput').value=time.toFixed(2);setBusy(true);
    $('status').textContent='Preparing the starting fields…';$('emptyMessage').hidden=false;$('emptyMessage').textContent='Preparing your starting pattern…';
    $('engineBadge').innerHTML='<span class="dot"></span>Starting engine';showNotice('');
    worker.postMessage({type:'init',runId,requestId,config,view,time});
  }
  function applyControls(){try{const c=readControls();reset(c);}catch(e){showNotice('Settings not applied: '+e.message,true);}}
  function scheduleChange(){updateOutputs();setBusy(true);clearTimeout(changeTimer);stopPlay();changeTimer=setTimeout(applyControls,280);}
  function requestTime(time,manual=true){
    if(!ready||fatal)return;
    if(manual)stopPlay();
    time=Math.max(0,Math.min(65536,Number(time)||0));
    while(time>horizon&&horizon<65536)horizon=Math.min(65536,horizon*2);
    updateTimelineLabels();requestId++;
    $('evolution').value=sliderAt(time);$('timeInput').value=time.toFixed(2);
    setBusy(true);$('status').textContent=`Calculating model age ${fmt(time)}…`;
    worker.postMessage({type:'seek',runId,requestId,time});
  }
  function requestStop(){stopPlay();requestId++;worker.postMessage({type:'stop',runId,requestId});}
  function playNext(){
    if(!playing||!frame||fatal)return;
    if(frame.time>=horizon-frame.dt/2){stopPlay();return;}
    const p=Math.min(1000,sliderAt(frame.time)+5);
    requestTime(Math.min(horizon,Math.max(frame.time+frame.dt,timeAt(p))),false);
  }
  function updateTimelineLabels(){
    $('timelineLabels').replaceChildren();
    for(let i=0;i<=4;i++){const s=document.createElement('span');const t=timeAt(i*250);s.textContent=t<10?fmt(t,1):fmt(t,0);$('timelineLabels').appendChild(s);}
    $('timelineCaption').textContent=`0–${fmt(horizon,0)} model units · logarithmic scrub`;
    $('extendButton').disabled=horizon>=65536;
  }
  function renderPins(){
    $('bookmarks').replaceChildren();for(const t of bookmarks){const b=document.createElement('button');b.textContent='Age '+fmt(t);b.title='Return to this pinned stage';b.onclick=()=>requestTime(t);$('bookmarks').appendChild(b);}
  }
  function fit(){
    const area=$('canvasArea'),r=frame?frame.nx/frame.ny:config.aspect;
    const w=Math.max(64,Math.min(area.clientWidth-24,(area.clientHeight-24)*r));
    const h=w/r;canvas.style.width=w+'px';canvas.style.height=h+'px';
    const internal=Math.max(256,Math.min(1024,Math.round(w*1.4)));
    canvas.width=internal;canvas.height=Math.round(internal/r);queuePaint();
  }
  function grayMask(width,height,depth=8,sourceFrame=frame,sourceView=view,sourceConfig=config){
    if(!sourceFrame)throw new Error('No completed state is available.');
    const {data,nx,ny}=sourceFrame,threshold=sourceView.threshold,wrap=sourceConfig.boundary==='periodic',bytes=depth/8;
    const out=new Uint8Array(width*height*bytes);
    const left=new Int32Array(width),right=new Int32Array(width),frac=new Float64Array(width);
    const bound=(i,n)=>wrap?(i%n+n)%n:Math.max(0,Math.min(n-1,i));
    for(let x=0;x<width;x++){const gx=(x+0.5)*nx/width-0.5,ix=Math.floor(gx);left[x]=bound(ix,nx);right[x]=bound(ix+1,nx);frac[x]=gx-ix;}
    for(let y=0;y<height;y++){
      const gy=(y+0.5)*ny/height-0.5,iy=Math.floor(gy),fy=gy-iy;
      const row0=bound(iy,ny)*nx,row1=bound(iy+1,ny)*nx;
      for(let x=0;x<width;x++){
        const a=data[2*(row0+left[x])],b=data[2*(row0+right[x])],c=data[2*(row1+left[x])],d=data[2*(row1+right[x])],fx=frac[x];
        const sample=(a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
        let value=sample>=threshold?0:255;if(sourceView.invert)value=255-value;
        const i=(y*width+x)*bytes;out[i]=value;if(bytes===2)out[i+1]=value;
      }
    }
    return out;
  }
  function queuePaint(){if(!paintPending){paintPending=true;requestAnimationFrame(paint);}}
  function paint(){
    paintPending=false;if(!frame){context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);return;}
    const g=grayMask(canvas.width,canvas.height),image=context.createImageData(canvas.width,canvas.height),rgba=image.data;
    for(let i=0;i<g.length;i++){const j=i*4;rgba[j]=g[i];rgba[j+1]=g[i];rgba[j+2]=g[i];rgba[j+3]=255;}
    context.putImageData(image,0,0);
  }
  function recipe(){return {format:'aggregation-explorer-setup',version:C.VERSION,
    config:{...config,backend:frame?frame.backend:config.backend},view:{...view},
    time:frame?frame.time:0,step:frame?frame.step:0,dt:frame?frame.dt:null,horizon,bookmarks:[...bookmarks],
    note:'Recipe only; continuous fields and cached history are rebuilt. Backend is saved explicitly for reproducibility.'};}
  async function saveBlob(blob,name,description,mime,extension){
    if(window.showSaveFilePicker){
      try{const handle=await window.showSaveFilePicker({suggestedName:name,types:[{description,accept:{[mime]:[extension]}}]});const stream=await handle.createWritable();await stream.write(blob);await stream.close();return;}
      catch(e){if(e.name==='AbortError')return;if(!['SecurityError','NotAllowedError','TypeError'].includes(e.name))throw e;}
    }
    const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function exportMask(){
    if(!frame||!frame.done||fatal)return;
    try {
      stopPlay();exporting=true;$('exportButton').disabled=true;
      const selected=frame,selectedView={...view},selectedConfig={...config},selectedRecipe=recipe();
      const width=Number($('exportSize').value)||selected.nx,height=Math.round(width*selected.ny/selected.nx),depth=Number($('bitDepth').value);
      $('status').textContent=`Encoding ${width} × ${height} grayscale PNG…`;
      await new Promise(r=>setTimeout(r,10));
      const g=grayMask(width,height,depth,selected,selectedView,selectedConfig),meta=JSON.stringify({...selectedRecipe,output:{width,height,depth,type:'grayscale',polarity:selectedView.invert?'white patches':'black patches',resampling:'bilinear u then fixed threshold',range:depth===8?[0,255]:[0,65535]}});
      const blob=await AggregationPNG.encode(g,width,height,depth,meta);
      const name=`aggregation_seed-${selectedConfig.seed}_age-${selected.time.toFixed(2)}_${width}x${height}_${depth}bit.png`;
      await saveBlob(blob,name,'Grayscale PNG','image/png','.png');
      $('status').textContent='PNG export prepared. The simulation state was not changed.';
    } catch(e){showNotice('Export failed: '+e.message,true);}finally{exporting=false;setBusy(!frame?.done);}
  }
  async function importRecipe(obj){
    if(obj.format!=='aggregation-explorer-setup'||obj.version!==C.VERSION)throw new Error('This is not a compatible 0.1.0 Aggregation Explorer setup.');
    const c=C.validate(obj.config);
    if(!obj.view||!Number.isFinite(obj.view.threshold)||obj.view.threshold<0.25||obj.view.threshold>10||typeof obj.view.invert!=='boolean')throw new Error('Invalid saved mask appearance.');
    if(!Number.isFinite(obj.time)||obj.time<0||obj.time>65536)throw new Error('Invalid saved model age.');
    view={threshold:obj.view.threshold,invert:obj.view.invert};$('threshold').value=view.threshold;$('invert').checked=view.invert;
    horizon=Math.max(512,Math.min(65536,Number(obj.horizon)||512));while(horizon<obj.time)horizon=Math.min(65536,horizon*2);
    bookmarks=Array.isArray(obj.bookmarks)?obj.bookmarks.filter(t=>Number.isFinite(t)&&t>=0&&t<=65536).slice(0,12):[];
    $('preset').value=c.init==='perturbations'?'reference':'balanced';writeControls(c);renderPins();updateTimelineLabels();reset(c,obj.time,true);
  }
  worker.onmessage=e=>{
    const m=e.data;if(m.runId!==runId)return;
    if(m.type==='ready'){
      ready=true;worker.postMessage({type:'view',runId,view});$('evolution').disabled=false;$('playButton').disabled=false;$('resetButton').disabled=false;$('endButton').disabled=false;
      $('gridBadge').textContent=`${m.nx} × ${m.ny} simulation · ${config.length} model units wide`;
      $('dtReadout').textContent=m.dt.toFixed(5);
      $('engineBadge').innerHTML='<span class="dot"></span>'+(m.backend==='gpu'?'WebGPU compute':'CPU worker');
      $('engineDetail').textContent=m.engineNotice||'GPU calculation available. No cloud service is involved.';
      if(m.backend==='cpu'&&!m.engineNotice)$('engineDetail').textContent='CPU worker selected. Calculation runs separately from the interface.';
    }
    if(m.type==='error'){
      fatal=true;stopPlay();showNotice(m.message,true);$('status').textContent='Run stopped. Revise settings and reset; no invalid result was exported.';setBusy(false);
      $('emptyMessage').hidden=!!frame;$('emptyMessage').textContent='The run could not start. See the message below.';
      $('evolution').disabled=true;$('playButton').disabled=true;$('endButton').disabled=true;
    }
    if(m.type==='frame'){
      // Ignore frames for a seek that has already been superseded by the UI.
      if(m.requestId!==requestId)return;
      const sizeChanged=!frame||frame.nx!==m.nx||frame.ny!==m.ny;frame=m;
      $('emptyMessage').hidden=true;if(sizeChanged)fit();else queuePaint();
      $('ageMetric').textContent=fmt(m.time);$('patchMetric').textContent=m.stats.patches.toLocaleString();$('areaMetric').textContent=fmt(m.stats.coverage*100,1)+'%';
      $('massReadout').textContent=m.stats.mass.toFixed(6);$('driftReadout').textContent=(m.stats.drift*100).toExponential(2)+'%';
      $('cacheReadout').textContent=`${m.cacheTimes.length} states · ${(m.cacheBytes/1048576).toFixed(1)} MiB`;
      $('cacheStatus').textContent=`Calculated through age ${fmt(m.maxTime,1)}`;
      $('cacheTicks').replaceChildren();for(const t of m.cacheTimes){if(t>horizon)continue;const tick=document.createElement('i');tick.style.left=(sliderAt(t)/10)+'%';$('cacheTicks').appendChild(tick);}
      if(m.done){$('evolution').value=sliderAt(m.time);if(document.activeElement!==$('timeInput'))$('timeInput').value=m.time.toFixed(2);}
      setBusy(!m.done);
      if(Math.abs(m.stats.drift)>0.002)showNotice('Material drift is above 0.2%. Compare a Fine-step run before relying on this late stage.');
      $('status').textContent=m.done?`Ready · age ${fmt(m.time)} · ${m.step.toLocaleString()} updates`:`Calculating age ${fmt(m.targetTime)} · currently ${fmt(m.time)}`;
      if(m.done&&playing){clearTimeout(playTimer);playTimer=setTimeout(playNext,55);}
    }
  };
  worker.onerror=e=>{fatal=true;stopPlay();showNotice(`Worker error: ${e.message}. Use the local launcher and try CPU worker mode.`,true);setBusy(false);};
  for(const id of CONFIG_IDS){
    const el=$(id);if(el.type==='range')el.addEventListener('input',scheduleChange);else el.addEventListener('change',applyControls);
  }
  $('preset').onchange=()=>{
    let c={...config,init:'patches'};
    if($('preset').value==='balanced')c={...c,radius:1.8,coverage:.24,variation:.70,irregularity:.35};
    if($('preset').value==='small')c={...c,radius:1.3,coverage:.18,variation:.80,irregularity:.35};
    if($('preset').value==='broad')c={...c,radius:3.4,coverage:.40,variation:.55,irregularity:.50};
    if($('preset').value==='reference')c={...c,init:'perturbations',total:4,a:4,b:1,da:.0625,db:1};
    writeControls(c);reset(c);
  };
  $('newSeed').onclick=()=>{const a=new Uint32Array(1);crypto.getRandomValues(a);$('seed').value=a[0];applyControls();};
  $('defaultsButton').onclick=()=>{$('preset').value='balanced';view={threshold:3,invert:false};$('threshold').value=3;$('invert').checked=false;horizon=512;writeControls(C.DEFAULTS);updateTimelineLabels();reset(C.DEFAULTS);};
  $('evolution').oninput=()=>requestTime(timeAt($('evolution').value));
  $('timeInput').onchange=()=>requestTime(Number($('timeInput').value));
  $('threshold').oninput=()=>{view.threshold=Number($('threshold').value);updateOutputs();queuePaint();worker.postMessage({type:'view',runId,view});};
  $('invert').onchange=()=>{view.invert=$('invert').checked;queuePaint();worker.postMessage({type:'view',runId,view});};
  $('playButton').onclick=()=>{if(playing){requestStop();return;}playing=true;$('playButton').textContent='Pause';if(frame?.done)playNext();};
  $('cancelButton').onclick=requestStop;
  $('resetButton').onclick=()=>requestTime(0);
  $('extendButton').onclick=()=>{horizon=Math.min(65536,horizon*2);updateTimelineLabels();if(frame)$('evolution').value=sliderAt(frame.done?frame.time:frame.targetTime);$('status').textContent=`Timeline extended to ${fmt(horizon,0)}. Your seed and existing history are unchanged.`;};
  $('endButton').onclick=()=>requestTime(horizon);
  $('pinButton').onclick=()=>{if(frame?.done&&bookmarks.length<12&&!bookmarks.includes(frame.time)){bookmarks.push(frame.time);bookmarks.sort((a,b)=>a-b);renderPins();}};
  $('fitButton').onclick=fit;
  $('fullscreenButton').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.studio').requestFullscreen();setTimeout(fit,60);}catch(e){showNotice('Fullscreen is unavailable in this window.');}};
  document.addEventListener('fullscreenchange',()=>{$('fullscreenButton').textContent=document.fullscreenElement?'Exit expanded view':'Expand view';setTimeout(fit,50);});
  $('exportButton').onclick=exportMask;
  $('saveSetup').onclick=async()=>{try{await saveBlob(new Blob([JSON.stringify(recipe(),null,2)],{type:'application/json'}),`aggregation_seed-${config.seed}_age-${frame.time.toFixed(2)}.json`,'Explorer setup','application/json','.json');}catch(e){showNotice('Setup save failed: '+e.message,true);}};
  $('loadSetup').onclick=()=>$('setupFile').click();
  $('setupFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>1024*1024)throw new Error('Setup file is too large. Select a saved JSON recipe, not an image.');await importRecipe(JSON.parse(await f.text()));}catch(err){showNotice('Setup was not loaded: '+err.message,true);}finally{e.target.value='';}};
  $('helpButton').onclick=()=>$('aboutDialog').showModal();$('closeAbout').onclick=()=>$('aboutDialog').close();
  window.addEventListener('resize',fit);new ResizeObserver(()=>fit()).observe($('canvasArea'));
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','SELECT','BUTTON','TEXTAREA'].includes(document.activeElement.tagName)&&!$('aboutDialog').open){e.preventDefault();$('playButton').click();}});
  // Read-only diagnostic entry points plus ordinary UI actions for reproducible automated testing.
  window.AggregationApp={get frame(){return frame;},get config(){return {...config};},get view(){return {...view};},get ready(){return ready;},get fatal(){return fatal;},
    seek:t=>requestTime(t),stop:requestStop,reset:c=>{const cfg=C.validate({...C.DEFAULTS,...c});$('preset').value=cfg.init==='perturbations'?'reference':'balanced';writeControls(cfg);reset(cfg);},
    recipe,importRecipe,grayMask,crc:()=>frame?AggregationPNG.crc32(new Uint8Array(frame.data.buffer)):null};
  writeControls(config);updateTimelineLabels();reset(config);fit();
})();
