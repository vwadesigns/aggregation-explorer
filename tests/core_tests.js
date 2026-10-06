/* Optional developer tests: node tests/core_tests.js. No npm dependencies. */
'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),C=require('../src/core.js'),P=require('../src/png.js');
const tests=[];const test=(name,fn)=>{const detail=fn();tests.push({name,result:'PASS',detail});console.log('PASS',name);};
function crc(a){return P.crc32(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));}
test('Identical seed gives identical starting fields',()=>{assert.equal(crc(C.initialize({seed:4281}).data),crc(C.initialize({seed:4281}).data));});
test('Changing the seed changes starting placement',()=>{assert.notEqual(crc(C.initialize({seed:4281}).data),crc(C.initialize({seed:4282}).data));});
test('Material budget is consistent across seeds',()=>{let worst=0;for(const seed of [0,1,2,4281,4294967295]){const s=C.initialize({seed,resolution:64});worst=Math.max(worst,Math.abs(s.initialMass-4));}assert(worst<1e-6);return {worstAbsoluteMeanError:worst};});
test('Selected parameters participate in initialization',()=>{const base=crc(C.initialize({resolution:96}).data);for(const [k,v]of Object.entries({radius:4,coverage:.5,variation:.1,irregularity:.7}))assert.notEqual(crc(C.initialize({resolution:96,[k]:v}).data),base,k);});
test('Rectangular closed and periodic domains stay finite and balanced',()=>{
 const rows=[];for(const boundary of ['closed','periodic']){const i=C.initialize({resolution:96,aspect:1.5,boundary});const s=new C.CPUSolver(i);s.advance(6000);const stats=C.inspect(s.data,i.nx,i.ny);const drift=(stats.mass-i.initialMass)/i.initialMass;assert(Math.abs(drift)<1e-4);rows.push({boundary,nx:i.nx,ny:i.ny,steps:s.step,dt:i.dt,drift});}return rows;
});
test('Checkpoint restore and forward replay are bit-identical',()=>{const i=C.initialize({resolution:96});const s=new C.CPUSolver(i);s.advance(317);const saved=s.read();s.advance(1083);const expected=crc(s.data);s.restore(saved,317);s.advance(1083);assert.equal(crc(s.data),expected);return {step:1400,crc:expected};});
test('Changing numerical batch size does not change the CPU result',()=>{const i=C.initialize({resolution:64});const a=new C.CPUSolver(i),b=new C.CPUSolver(i);a.advance(1000);for(let k=0;k<100;k++)b.advance(10);assert.equal(crc(a.data),crc(b.data));});
test('Cache remains bounded and always retains initial state',()=>{const cache=new C.CheckpointCache(1024,4096),data=new Float32Array(256);for(let s=0;s<20;s++)cache.put(s,data);assert(cache.map.size<=4);assert(cache.map.has(0));assert.equal(cache.best(7).step,0);return {retainedSteps:cache.keys()};});
test('Invalid parameter combinations are rejected explicitly',()=>{for(const x of [{seed:-1},{seed:1.5},{radius:0},{total:Infinity},{boundary:'made-up'},{resolution:513}])assert.throws(()=>C.initialize(x));assert.throws(()=>C.initialize({init:'perturbations',total:2,a:6,b:.5}));});
test('Finite extremes of initialization and short evolution',()=>{const rows=[];for(const p of [
 {coverage:.12,total:7,radius:1.2,variation:1,irregularity:.8},
 {coverage:.65,total:2,radius:9,variation:0,irregularity:0},
 {a:6,b:.5,da:.2,db:2}, {init:'perturbations'}, {aspect:.75,boundary:'periodic'}]){
 const i=C.initialize({resolution:96,...p}),s=new C.CPUSolver(i);s.advance(1000);const t=C.inspect(s.data,i.nx,i.ny);assert(Math.abs(t.mass-i.initialMass)<.002);rows.push({parameters:p,dt:i.dt,minU:t.minU,minV:t.minV,mass:t.mass});}return rows;});
test('Longer default CPU run shows genuine patch loss',()=>{const i=C.initialize({resolution:128}),s=new C.CPUSolver(i),before=C.inspect(s.data,i.nx,i.ny);s.advance(Math.round(300/i.dt));const after=C.inspect(s.data,i.nx,i.ny);assert(after.patches<before.patches);assert(Math.abs(after.mass-i.initialMass)<.002);return {grid:[i.nx,i.ny],time:300,initialPatches:before.patches,finalPatches:after.patches,initialCoverage:before.coverage,finalCoverage:after.coverage,relativeMassDrift:(after.mass-i.initialMass)/i.initialMass};});
const out={version:C.VERSION,node:process.version,tests};
fs.writeFileSync(path.join(__dirname,'core_results.json'),JSON.stringify(out,null,2));
