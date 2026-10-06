/* Browser GPU version of the same DDA update. Explicit old/new state, no in-place neighbor writes. */
(function(root) {
  'use strict';
  const SHADER = `
struct Params {
  nx: u32, ny: u32, boundary: u32, reserved: u32,
  a: f32, b: f32, da: f32, db: f32,
  dt: f32, ix: f32, iy: f32, pad: f32,
};
@group(0) @binding(0) var<storage, read> oldState: array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> newState: array<vec2<f32>>;
@group(0) @binding(2) var<uniform> p: Params;
fn at(x: i32, y: i32) -> vec2<f32> {
  let w = i32(p.nx); let h = i32(p.ny);
  var xx = clamp(x, 0, w - 1); var yy = clamp(y, 0, h - 1);
  if (p.boundary == 1u) { xx = (x + w) % w; yy = (y + h) % h; }
  return oldState[u32(yy) * p.nx + u32(xx)];
}
@compute @workgroup_size(8, 8)
fn evolve(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= p.nx || gid.y >= p.ny) { return; }
  let x = i32(gid.x); let y = i32(gid.y); let i = gid.y * p.nx + gid.x;
  let uv = oldState[i];
  let lap = (at(x-1,y) - 2.0*uv + at(x+1,y))*p.ix
          + (at(x,y-1) - 2.0*uv + at(x,y+1))*p.iy;
  let exchange = uv.x*uv.y - p.a*uv.x/(p.b+uv.x);
  newState[i] = uv + p.dt * vec2<f32>(exchange+p.da*lap.x, -exchange+p.db*lap.y);
}
`;
  let devicePromise=null;
  async function getDevice() {
    if(!devicePromise) devicePromise=(async()=>{
      if(!navigator.gpu) throw new Error('WebGPU is not exposed in this browser context.');
      const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
      if(!adapter)throw new Error('No WebGPU adapter is available.');
      const device=await adapter.requestDevice();
      return {device,adapter};
    })();
    return devicePromise;
  }
  class GPUSolver {
    static async create(init) {
      const {device,adapter}=await getDevice();
      const s=new GPUSolver(init,device,adapter);
      device.pushErrorScope('validation');
      try {
        const module=device.createShaderModule({label:'DDA equations',code:SHADER});
        const info=await module.getCompilationInfo();
        const errors=info.messages.filter(m=>m.type==='error');
        if(errors.length)throw new Error(errors.map(m=>`WGSL line ${m.lineNum}: ${m.message}`).join('\n'));
        s.pipeline=await device.createComputePipelineAsync({label:'DDA synchronous Euler',layout:'auto',compute:{module,entryPoint:'evolve'}});
        const layout=s.pipeline.getBindGroupLayout(0);
        s.groups=[0,1].map(i=>device.createBindGroup({layout,entries:[
          {binding:0,resource:{buffer:s.buffers[i]}},
          {binding:1,resource:{buffer:s.buffers[1-i]}},
          {binding:2,resource:{buffer:s.uniform}}
        ]}));
        const error=await device.popErrorScope();if(error)throw new Error(error.message);
        return s;
      } catch(e) {try{await device.popErrorScope();}catch(_){}s.dispose();throw e;}
    }
    constructor(init,device,adapter) {
      this.init=init;this.device=device;this.backend='gpu';this.step=0;this.side=0;this.failure=null;this.disposed=false;
      this.description=adapter.info?`${adapter.info.vendor||''} ${adapter.info.architecture||''}`.trim():'';
      const size=init.data.byteLength;
      this.buffers=[0,1].map(()=>device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST}));
      this.staging=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
      this.uniform=device.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
      const params=new ArrayBuffer(48),u=new Uint32Array(params),f=new Float32Array(params);
      u[0]=init.nx;u[1]=init.ny;u[2]=+(init.config.boundary==='periodic');
      f[4]=init.config.a;f[5]=init.config.b;f[6]=init.config.da;f[7]=init.config.db;
      f[8]=init.dt;f[9]=1/init.hx**2;f[10]=1/init.hy**2;
      device.queue.writeBuffer(this.uniform,0,params);device.queue.writeBuffer(this.buffers[0],0,init.data);
      this.onError=e=>{if(!this.disposed)this.failure=new Error(`WebGPU validation: ${e.error.message}`);};
      device.addEventListener('uncapturederror',this.onError);
      device.lost.then(info=>{if(!this.disposed)this.failure=new Error(`WebGPU device lost: ${info.message||info.reason}. Reset to restart; the backend was not silently changed.`);});
    }
    async advance(count) {
      if(this.failure)throw this.failure;
      const encoder=this.device.createCommandEncoder();
      const pass=encoder.beginComputePass();pass.setPipeline(this.pipeline);
      for(let i=0;i<count;i++) {pass.setBindGroup(0,this.groups[this.side]);pass.dispatchWorkgroups(Math.ceil(this.init.nx/8),Math.ceil(this.init.ny/8));this.side=1-this.side;}
      pass.end();this.device.queue.submit([encoder.finish()]);this.step+=count;
    }
    async read() {
      if(this.failure)throw this.failure;
      const encoder=this.device.createCommandEncoder();
      encoder.copyBufferToBuffer(this.buffers[this.side],0,this.staging,0,this.init.data.byteLength);
      this.device.queue.submit([encoder.finish()]);
      await this.staging.mapAsync(GPUMapMode.READ);
      const copy=new Float32Array(this.staging.getMappedRange().slice(0));this.staging.unmap();
      if(this.failure)throw this.failure;return copy;
    }
    restore(data,step) {if(this.failure)throw this.failure;this.side=0;this.device.queue.writeBuffer(this.buffers[0],0,data);this.step=step;}
    dispose() {this.disposed=true;this.device.removeEventListener('uncapturederror',this.onError);for(const b of [...this.buffers,this.staging,this.uniform])b.destroy();}
  }
  root.AggregationGPU={GPUSolver,SHADER};
})(globalThis);
