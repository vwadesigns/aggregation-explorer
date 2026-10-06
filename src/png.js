/* Small grayscale PNG encoder. No third-party dependency; zlib stored-block fallback. */
(function(root){
  'use strict';
  const crcTable=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}
  function crc32(a){let c=0xffffffff;for(const b of a)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  function concat(arrays){const out=new Uint8Array(arrays.reduce((s,a)=>s+a.length,0));let at=0;for(const a of arrays){out.set(a,at);at+=a.length;}return out;}
  function u32(v){const a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,v);return a;}
  function chunk(name,data){const tag=new TextEncoder().encode(name),body=concat([tag,data]);return concat([u32(data.length),body,u32(crc32(body))]);}
  function storedZlib(data){
    const pieces=[new Uint8Array([0x78,0x01])];
    for(let i=0;i<data.length;i+=65535){const len=Math.min(65535,data.length-i),inv=(~len)&65535;pieces.push(new Uint8Array([+(i+len===data.length),len&255,len>>>8,inv&255,inv>>>8]),data.subarray(i,i+len));}
    let a=1,b=0;for(let i=0;i<data.length;i++){a=(a+data[i])%65521;b=(b+a)%65521;}
    pieces.push(u32(((b<<16)|a)>>>0));return concat(pieces);
  }
  async function encode(gray,width,height,depth=8,metadata='') {
    const bytes=depth/8;if(![8,16].includes(depth)||gray.length!==width*height*bytes)throw new Error('Invalid grayscale PNG dimensions.');
    const row=width*bytes,raw=new Uint8Array((row+1)*height);
    for(let y=0;y<height;y++)raw.set(gray.subarray(y*row,(y+1)*row),y*(row+1)+1);
    let compressed;
    if(typeof CompressionStream!=='undefined') {
      const stream=new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
      compressed=new Uint8Array(await new Response(stream).arrayBuffer());
    } else compressed=storedZlib(raw);
    const header=new Uint8Array(13),dv=new DataView(header.buffer);dv.setUint32(0,width);dv.setUint32(4,height);header[8]=depth;header[9]=0;
    const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header)];
    if(metadata)chunks.push(chunk('tEXt',new TextEncoder().encode('Description\0'+metadata.replace(/[^\x20-\x7e]/g,' '))));
    chunks.push(chunk('IDAT',compressed),chunk('IEND',new Uint8Array()));
    return new Blob(chunks,{type:'image/png'});
  }
  root.AggregationPNG={encode,crc32,storedZlib};if(typeof module!=='undefined'&&module.exports)module.exports=root.AggregationPNG;
})(globalThis);
