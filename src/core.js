/* Aggregation Explorer 0.1.0 — independently written DDA equation implementation.
 * Mathematical reference: Siteur et al. (2023), doi:10.1073/pnas.2202683120.
 * Seeded patches, UI, cell-face boundaries and synchronous updates are adaptations.
 * No research notebook source is bundled. See docs/MODEL.md.
 */
(function(root) {
  'use strict';
  const VERSION = 'dda-explorer-0.1.0';
  const DEFAULTS = Object.freeze({seed:4281, resolution:192, aspect:1, length:96,
    radius:1.8, coverage:0.24, variation:0.70, irregularity:0.35,
    total:4, a:4, b:1, da:0.0625, db:1, boundary:'closed', init:'patches',
    accuracy:'standard', backend:'auto'});
  const LIMITS = {seed:[0,4294967295], resolution:[64,512], aspect:[0.5,2], length:[48,192],
    radius:[1.2,9], coverage:[0.12,0.65], variation:[0,1], irregularity:[0,0.8],
    total:[2,7], a:[2,6], b:[0.5,2], da:[0.025,0.2], db:[0.5,2]};
  function validate(input) {
    const c = {...DEFAULTS, ...input};
    for (const [k,[lo,hi]] of Object.entries(LIMITS)) {
      if (typeof c[k] !== 'number' || !Number.isFinite(c[k]) || c[k]<lo || c[k]>hi)
        throw new Error(`${k} must be a finite number between ${lo} and ${hi}.`);
    }
    if (!Number.isInteger(c.seed) || !Number.isInteger(c.resolution)) throw new Error('Seed and resolution must be whole numbers.');
    if (!['closed','periodic'].includes(c.boundary)) throw new Error('Unknown boundary mode.');
    if (!['patches','perturbations'].includes(c.init)) throw new Error('Unknown starting mode.');
    if (!['standard','fine'].includes(c.accuracy)) throw new Error('Unknown accuracy setting.');
    if (!['auto','cpu','gpu'].includes(c.backend)) throw new Error('Unknown compute backend.');
    return c;
  }
  function rng32(seed) {
    let s=(seed>>>0)||0x6d2b79f5;
    return function() {s ^= s<<13; s ^= s>>>17; s ^= s<<5; return (s>>>0)/4294967296;};
  }
  function smoothstep(lo,hi,x) {const t=Math.min(1,Math.max(0,(x-lo)/(hi-lo)));return t*t*(3-2*t);}
  function dimensions(c) {
    const nx=c.resolution, ny=Math.max(32,Math.round(nx/c.aspect));
    return {nx,ny,lx:c.length,ly:c.length*ny/nx,hx:c.length/nx,hy:c.length/nx};
  }
  function equilibrium(total,a,b) {
    const disc=(total-b)**2-4*(a-total*b);
    if (disc<0) throw new Error('This material / feedback combination has no real positive uniform equilibrium. Use seeded patches or revise the coefficients.');
    const u=(total-b+Math.sqrt(disc))/2, v=total-u;
    if (!(u>0 && v>0)) throw new Error('The positive reference equilibrium does not exist for these settings.');
    return [u,v];
  }
  function initialize(input) {
    const config=validate(input), d=dimensions(config), {nx,ny,lx,ly,hx,hy}=d;
    const N=nx*ny, data=new Float32Array(2*N), rand=rng32(config.seed);
    let patchCount=0;
    if (config.init==='perturbations') {
      const [u0,v0]=equilibrium(config.total,config.a,config.b);
      const noise=new Float64Array(N); let mean=0;
      for(let i=0;i<N;i++) {noise[i]=(rand()-0.5)*0.1;mean+=noise[i]/N;}
      for(let i=0;i<N;i++) {
        const z=noise[i]-mean;
        // Paired disturbances conserve the starting total; not the notebook's independent noise.
        data[2*i]=u0+z; data[2*i+1]=v0-z;
      }
    } else {
      const shape=new Float32Array(N);
      const r=config.radius;
      // Expected coverage of a random union. Actual coverage is reported, not forced.
      patchCount=Math.max(2,Math.round(-Math.log(1-config.coverage)*lx*ly/(Math.PI*r*r*(1+0.6*config.variation**2))));
      function stamp(cx,cy,rx,ry,angle,phase,rough) {
        const limit=Math.max(rx,ry)*(1+rough)+hx*1.8;
        const c=Math.cos(angle),s=Math.sin(angle),edge=Math.max(hx*1.25,0.18);
        let xa=Math.floor((cx-limit)/hx),xb=Math.ceil((cx+limit)/hx);
        let ya=Math.floor((cy-limit)/hy),yb=Math.ceil((cy+limit)/hy);
        for(let yy=ya; yy<=yb; yy++) {
          if(config.boundary==='closed' && (yy<0||yy>=ny)) continue;
          const y=(yy%ny+ny)%ny,dy=(yy+0.5)*hy-cy;
          for(let xx=xa; xx<=xb; xx++) {
            if(config.boundary==='closed' && (xx<0||xx>=nx)) continue;
            const x=(xx%nx+nx)%nx,dx=(xx+0.5)*hx-cx;
            const ax=(c*dx+s*dy)/rx,ay=(-s*dx+c*dy)/ry;
            const theta=Math.atan2(ay,ax);
            const wobble=1+rough*(0.58*Math.sin(3*theta+phase)+0.28*Math.cos(5*theta-phase));
            const dist=(Math.hypot(ax,ay)-wobble)*Math.min(rx,ry);
            const g=1-smoothstep(-edge,edge,dist),i=y*nx+x;
            if(g>shape[i]) shape[i]=g;
          }
        }
      }
      for(let j=0;j<patchCount;j++) {
        const cx=rand()*lx,cy=rand()*ly;
        const rr=r*Math.exp((rand()-0.5)*1.8*config.variation);
        const stretch=1+(rand()-0.5)*0.65;
        const angle=rand()*Math.PI*2,phase=rand()*Math.PI*2;
        stamp(cx,cy,rr*stretch,rr/stretch,angle,phase,config.irregularity);
        if(rand()<config.irregularity*0.7) {
          const t=rand()*Math.PI*2;
          stamp(cx+Math.cos(t)*rr*0.7,cy+Math.sin(t)*rr*0.7,rr*0.65,rr*0.52,t,phase,config.irregularity*0.7);
        }
      }
      let meanG=0;for(const g of shape)meanG+=g/N;
      if(meanG<1e-5) throw new Error('The starting patches are unresolved at this grid. Increase patch size or simulation resolution.');
      const floor=0.025, mobile=Math.min(0.65, config.total*0.3);
      const amplitude=(config.total-mobile-floor)/meanG;
      for(let i=0;i<N;i++) {data[2*i]=floor+amplitude*shape[i];data[2*i+1]=mobile;}
    }
    const stats=inspect(data,nx,ny,3,config.boundary,false);
    const maxD=Math.max(config.da,config.db);
    // Conservative positivity-aware starting bound; dyadic time steps give stable step IDs.
    const reactionBound=Math.max(32,stats.maxU*1.6,config.a/config.b);
    const safe=0.72/(2*maxD*(1/hx**2+1/hy**2)+reactionBound);
    let dt=0.02;
    while(dt>safe) dt*=0.5;
    if(config.accuracy==='fine') dt*=0.5;
    return {config,...d,data,dt,initialMass:stats.mass,patchCount};
  }
  function neighbors(nx,ny,periodic) {
    const xL=new Int32Array(nx),xR=new Int32Array(nx),yU=new Int32Array(ny),yD=new Int32Array(ny);
    for(let x=0;x<nx;x++){xL[x]=x>0?x-1:(periodic?nx-1:0);xR[x]=x<nx-1?x+1:(periodic?0:nx-1);}
    for(let y=0;y<ny;y++){yU[y]=(y>0?y-1:(periodic?ny-1:0))*nx;yD[y]=(y<ny-1?y+1:(periodic?0:ny-1))*nx;}
    return {xL,xR,yU,yD};
  }
  class CPUSolver {
    constructor(init) {this.init=init;this.data=init.data.slice();this.next=new Float32Array(this.data.length);this.step=0;this.backend='cpu';this.nb=neighbors(init.nx,init.ny,init.config.boundary==='periodic');}
    advance(count) {
      const {nx,ny,hx,hy,dt,config:c}=this.init, {xL,xR,yU,yD}=this.nb;
      const ix=1/(hx*hx),iy=1/(hy*hy),{a,b,da,db}=c;
      for(let n=0;n<count;n++) {
        const src=this.data,dst=this.next;
        for(let y=0;y<ny;y++) {
          const row=y*nx,up=yU[y],down=yD[y];
          for(let x=0;x<nx;x++) {
            const i=2*(row+x),l=2*(row+xL[x]),r=2*(row+xR[x]),u=2*(up+x),d=2*(down+x);
            const A=src[i],B=src[i+1];
            const lapA=(src[l]-2*A+src[r])*ix+(src[u]-2*A+src[d])*iy;
            const lapB=(src[l+1]-2*B+src[r+1])*ix+(src[u+1]-2*B+src[d+1])*iy;
            const exchange=A*B-a*A/(b+A);
            dst[i]=A+dt*(exchange+da*lapA);
            dst[i+1]=B+dt*(-exchange+db*lapB);
          }
        }
        this.next=src;this.data=dst;this.step++;
      }
    }
    read(){return this.data.slice();}
    restore(data,step){this.data.set(data);this.step=step;}
    dispose(){}
  }
  function inspect(data,nx,ny,threshold=3,boundary='closed',components=true) {
    const N=nx*ny;let mass=0,filled=0,maxU=-Infinity,minU=Infinity,minV=Infinity,maxV=-Infinity;
    const mask=components?new Uint8Array(N):null;
    for(let i=0;i<N;i++) {
      const u=data[2*i],v=data[2*i+1];
      if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||v<0)
        throw new Error(`Numerical check failed at cell ${i}: u=${u}, v=${v}. Nothing was clamped. Reset using Fine time steps or less extreme settings.`);
      mass+=(u+v)/N;maxU=Math.max(maxU,u);minU=Math.min(minU,u);maxV=Math.max(maxV,v);minV=Math.min(minV,v);
      const bit=+(u>=threshold);filled+=bit;if(mask)mask[i]=bit;
    }
    let patches=0,largest=0;
    if(mask) {
      const stack=new Int32Array(N),wrap=boundary==='periodic';
      for(let i=0;i<N;i++) {
        if(!mask[i])continue;
        patches++;let head=0,tail=1,area=0;stack[0]=i;mask[i]=0;
        while(head<tail){
          const p=stack[head++],x=p%nx,y=(p/nx)|0;area++;
          const adj=[x>0?p-1:(wrap?p+nx-1:-1),x<nx-1?p+1:(wrap?p-nx+1:-1),y>0?p-nx:(wrap?p+(ny-1)*nx:-1),y<ny-1?p+nx:(wrap?p-(ny-1)*nx:-1)];
          for(const q of adj)if(q>=0&&mask[q]){mask[q]=0;stack[tail++]=q;}
        }
        largest=Math.max(largest,area);
      }
    }
    return {mass,coverage:filled/N,patches,largest,maxU,minU,minV,maxV};
  }
  class CheckpointCache {
    constructor(bytesPerState,budget=48*1024*1024){this.limit=Math.max(2,Math.min(96,Math.floor(budget/bytesPerState)));this.map=new Map();this.clock=0;}
    put(step,data) {this.map.set(step,{data:data.slice(),used:++this.clock});while(this.map.size>this.limit){let victim=-1,old=Infinity;for(const [s,c]of this.map)if(s!==0&&s!==step&&c.used<old){victim=s;old=c.used;}if(victim<0)break;this.map.delete(victim);}}
    best(target){let found=-1;for(const s of this.map.keys())if(s<=target&&s>found)found=s;if(found<0)return null;const c=this.map.get(found);c.used=++this.clock;return {step:found,data:c.data};}
    keys(){return [...this.map.keys()].sort((a,b)=>a-b);}
  }
  function sampleU(data,nx,ny,x,y,periodic=false) {
    let x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0;
    let x1=x0+1,y1=y0+1;
    const bound=(i,n)=>periodic?(i%n+n)%n:Math.max(0,Math.min(n-1,i));
    x0=bound(x0,nx);x1=bound(x1,nx);y0=bound(y0,ny);y1=bound(y1,ny);
    const a=data[2*(y0*nx+x0)],b=data[2*(y0*nx+x1)],c=data[2*(y1*nx+x0)],d=data[2*(y1*nx+x1)];
    return (a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
  }
  const api={VERSION,DEFAULTS,LIMITS,validate,rng32,smoothstep,dimensions,equilibrium,initialize,CPUSolver,inspect,CheckpointCache,sampleU};
  root.AggregationCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
