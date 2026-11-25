/* V550 phase 1: remove synchronous Canvas color readback. Coast Rush HD: ordered, premultiplied 2D batching on the visible WebGL 2 framebuffer. */
(() => {
'use strict';
const STRIDE = 20, NO_CLIP = [-1e8,-1e8,1e8,1e8];
const ID = [1, 0, 0, 1, 0, 0], WHITE = [1, 1, 1, 1], TAU = 2 * Math.PI;
const clamp = x => Math.min(1, Math.max(0, x));
const cross = (a, b, c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const same = (a,b) => a && b && Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]) < 1e-7;
function point(m,x,y) {
 return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
}
function inverse(m) {
 const d=m[0]*m[3]-m[1]*m[2];
 return d ? [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d] : ID;
}
function triangles(points) {
 if(points.length===3&&!same(points[0],points[1])&&!same(points[1],points[2])&&!same(points[0],points[2]))return points;
 const p=points.filter((v,i)=>!same(v,points[i-1]));
 if(same(p[0],p[p.length-1]))p.pop();
 if(p.length<3)return [];
 if(p.length===3)return p;
 let area=0;
 for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];area+=a[0]*b[1]-a[1]*b[0];}
 const sign=area<0?-1:1,out=[];
 if(p.every((v,i)=>sign*cross(p[(i+p.length-1)%p.length],v,p[(i+1)%p.length])>=-1e-7)){
  for(let i=1;i+1<p.length;i++)out.push(p[0],p[i],p[i+1]);
  return out;
 }
 while(p.length>3){
  const i=p.findIndex((b,i)=>{
   const a=p[(i+p.length-1)%p.length],c=p[(i+1)%p.length];
   if(sign*cross(a,b,c)<=1e-7)return false;
   return !p.some(v=>v!==a&&v!==b&&v!==c&&sign*cross(a,b,v)>1e-7&&sign*cross(b,c,v)>1e-7&&sign*cross(c,a,v)>1e-7);
  });
  if(i<0)break;
  out.push(p[(i+p.length-1)%p.length],p[i],p[(i+1)%p.length]);p.splice(i,1);
 }
 if(p.length===3)out.push(...p);
 return out;
}
class Pattern {
 constructor(source){this.source=source;this.inv=ID;}
 setTransform(m){this.inv=inverse([m.a,m.b,m.c,m.d,m.e,m.f]);}
}
class Gradient {
 constructor(radial,m,args){this.radial=radial;this.inv=inverse(m);this.args=args;this.stops=[];this.key='';}
 addColorStop(offset,color){this.stops.push([offset,color]);this.stops.sort((a,b)=>a[0]-b[0]);this.key='';}
}
const vertex = `#version 300 es
layout(location=0) in vec2 xy;
layout(location=1) in vec2 st;
layout(location=2) in vec4 rgba;
layout(location=3) in vec2 kind;
layout(location=4) in vec4 radial;
layout(location=5) in vec4 bounds;
layout(location=6) in vec2 clippedXY;
uniform vec2 viewportSize;
out vec2 uv;
out vec4 tint;
flat out int slot;
flat out int mode;
flat out vec4 circle;
flat out vec4 clipRect;
out vec2 clipPosition;
void main(){
 float w=kind.y==3. ? radial.x : 1.;
 gl_Position=vec4((xy/viewportSize*vec2(2,-2)+vec2(-1,1))*w,0,w);
 uv=st;tint=rgba;slot=int(kind.x);mode=int(kind.y);circle=radial;clipRect=bounds;clipPosition=clippedXY;
}`;
const fragment = `#version 300 es
precision highp float;
in vec2 uv;
in vec4 tint;
flat in int slot;
flat in int mode;
flat in vec4 circle;
flat in vec4 clipRect;
in vec2 clipPosition;
uniform sampler2D images[8];
out vec4 pixel;
void main(){
 if(any(lessThan(clipPosition,clipRect.xy))||any(greaterThanEqual(clipPosition,clipRect.zw)))discard;
 vec2 q=uv;
 if(mode==1)q=vec2((.5+255.*clamp(q.x,0.,1.))/256.,.5);
 if(mode==2){
  vec2 d=circle.xy;
  float r=circle.z,dr=circle.w;
  float a=dot(d,d)-dr*dr,b=-2.*(dot(q,d)+r*dr),c=dot(q,q)-r*r;
  float disc=b*b-4.*a*c;
  if(disc<0.)discard;
  float t=abs(a)<.00001 ? (abs(b)<.00001 ? 0. : -c/b) : (-b-sign(a)*sqrt(disc))/(2.*a);
  if(abs(a)>=.00001)t=max(t,(-b+sign(a)*sqrt(disc))/(2.*a));
  if(r+t*dr<0.)discard;
  q=vec2((.5+255.*clamp(t,0.,1.))/256.,.5);
 }
 vec4 s=vec4(1);
 // Explicit indices are required by GLSL ES 3.00. Use pre-wrap derivatives
 // for the repeating road material and keep texture sampling batchable.
 vec2 dx=dFdx(q),dy=dFdy(q);
 switch(slot){
 ${Array.from({length:8},(_,i)=>`case ${i}: s=textureGrad(images[${i}],q,dx,dy);break;`).join('\n')}
 }
 pixel=s*tint;
}`;
class CoastWebGL2 {
 constructor(canvas,isTV){
  this.canvas=canvas;
  const attributes={alpha:false,depth:false,stencil:true,antialias:!isTV,desynchronized:true};
  this.gl=canvas.getContext('webgl2',attributes);
  // Some devices reject the low-latency or multisampled drawing buffer.
  if(!this.gl)this.gl=canvas.getContext('webgl2',{...attributes,antialias:false,desynchronized:false});
  if(!this.gl)throw new Error('Le navigateur n’a pas pu créer le contexte WebGL 2.');
  if(!this.gl.getContextAttributes()?.stencil)throw new Error('Le contexte WebGL 2 ne fournit pas le tampon stencil requis.');
  this.isTV=isTV;
  this.pageSize=isTV?1024:2048;
  this.budget=(isTV?64:144)*1024*1024;
  this.data=new Float32Array(STRIDE*32768);
  this.glyphChars=Array.from({length:224},(_,i)=>String.fromCharCode(i+32)).filter(c=>c.charCodeAt(0)<127||c.charCodeAt(0)>=160).concat(Array.from('◀▶↑↓←→★☆✓⚡❄☁…'));
  this.glyphAtlas=new Image();
  const esc=c=>c.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const rows=Math.ceil(this.glyphChars.length/16);
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="'+(rows*64)+'"><g fill="white" font-family="Arial,sans-serif" font-weight="bold" font-size="44" text-anchor="middle">'+this.glyphChars.map((c,i)=>'<text x="'+(i%16*64+32)+'" y="'+(Math.floor(i/16)*64+48)+'">'+esc(c)+'</text>').join('')+'</g></svg>';
  this.glyphAtlas.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  this.colors=new Map();
  this.text=new Map();
  this.serial=0;
  this.preparedSources=new WeakMap();
  this.preparedBytes=0;
  this.preparedLimit=(isTV?32:64)*1024*1024;
  this.resetState();
  this.init();
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;});
  canvas.addEventListener('webglcontextrestored',()=>{for(const t of this.pages)t.handle=null;this.init();this.lost=false;});
 }
 resetState(){
  this.state={m:ID,clip:0,bounds:NO_CLIP,clipTransform:ID,fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,
   globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter',
   font:'10px sans-serif',textAlign:'start',textBaseline:'alphabetic',dash:[],shadowBlur:0,shadowColor:'transparent'};
  this.stack=[];this.beginPath();
 }
 init(){
  const gl=this.gl;
  const program=gl.createProgram();
  for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
   const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
   gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  this.program=program;
  this.size=gl.getUniformLocation(program,'viewportSize');
  gl.useProgram(program);
  gl.uniform1iv(gl.getUniformLocation(program,'images[0]'),[0,1,2,3,4,5,6,7]);
  this.framebuffer=gl.createFramebuffer();
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
  this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  this.streamCapacity=this.data.length/STRIDE*3;
  this.streamCursor=0;
  gl.bufferData(gl.ARRAY_BUFFER,this.streamCapacity*STRIDE*4,gl.STREAM_DRAW);
  let offset=0;
  [2,2,4,2,4,4,2].forEach((width,i)=>{
   gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,width,gl.FLOAT,false,STRIDE*4,offset);
   offset+=width*4;
  });
  gl.enable(gl.BLEND);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
  this.sources=new WeakMap();this.ramps=new Map();this.pages=[];this.bytes=0;
  this.slots=[];this.bound=[];this.used=0;this.blend='';
  this.timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  this.pendingTimer=null;this.activeTimer=null;
  this.metrics={frames:0,drawCalls:0,triangles:0,uploads:0,uploadBytes:0,bytes:0};
  this.white=this.texture(1,1,false,false,new Uint8Array([255,255,255,255]));
  for(let i=0;i<8;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,this.white.handle);this.bound[i]=this.white;}
 }
 beginFrame(profile=false){
  if(this.lost)return false;
  const gl=this.gl;
  this.serial++;this.resetState();this.portalClip=null;
  this.metrics.drawCalls=this.metrics.triangles=this.metrics.uploads=this.metrics.uploadBytes=0;this.metrics.uploadNames=[];
  gl.viewport(0,0,this.canvas.width,this.canvas.height);
  gl.uniform2f(this.size,this.canvas.width,this.canvas.height);
  // Each stencil clip clears its own bit before writing it.
  gl.disable(gl.STENCIL_TEST);
  if(this.pendingTimer&&gl.getQueryParameter(this.pendingTimer,gl.QUERY_RESULT_AVAILABLE)){
   const valid=!gl.getParameter(this.timer.GPU_DISJOINT_EXT);
   this.metrics.gpuMs=valid?gl.getQueryParameter(this.pendingTimer,gl.QUERY_RESULT)/1e6:undefined;
   gl.deleteQuery(this.pendingTimer);this.pendingTimer=null;
  }
  if(profile&&this.timer&&!this.pendingTimer&&this.serial%15===0){
   this.activeTimer=gl.createQuery();
   gl.beginQuery(this.timer.TIME_ELAPSED_EXT,this.activeTimer);
  }
  return true;
 }
 endFrame(){
  this.flush();this.metrics.frames++;
  if(this.activeTimer){
   this.gl.endQuery(this.timer.TIME_ELAPSED_EXT);
   this.pendingTimer=this.activeTimer;this.activeTimer=null;
  }
  this.metrics.bytes=this.bytes;
  const hardBudget=this.budget*1.2;
  if(this.bytes>hardBudget||(this.bytes>this.budget&&this.serial%30===0)){
   // Bound texture destruction per frame; avoid sorting the entire GPU cache.
   for(let removed=0;removed<2&&this.bytes>this.budget;removed++){
    const minAge=this.bytes>hardBudget?45:180;
    let oldest=null;
    for(const t of this.pages)if(t.handle&&this.serial-t.last>=minAge&&(!oldest||t.last<oldest.last))oldest=t;
    if(!oldest)break;
    this.gl.deleteTexture(oldest.handle);oldest.handle=null;this.bytes-=oldest.bytes;
    if(oldest.key)this.ramps.delete(oldest.key);
    for(let i=0;i<this.bound.length;i++)if(this.bound[i]===oldest){this.gl.activeTexture(this.gl.TEXTURE0+i);this.gl.bindTexture(this.gl.TEXTURE_2D,this.white.handle);this.bound[i]=this.white;}
   }
   this.pages=this.pages.filter(t=>t.handle);
  }
 }
 flush(){
  if(!this.used)return;
  const gl=this.gl;
  // Unused sampler units already have complete textures; only update active slots.
  for(let i=0;i<this.slots.length;i++){
   const t=this.slots[i];
   if(this.bound[i]!==t){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t.handle);this.bound[i]=t;}
  }
  if(this.slots.length<8&&this.bound[7]===null){gl.activeTexture(gl.TEXTURE0+7);gl.bindTexture(gl.TEXTURE_2D,this.white.handle);this.bound[7]=this.white;}
  const count=this.used/STRIDE;
  // Append until wrap, then replace the backing store so queued draws can finish
  // reading the previous one without waiting for this upload.
  if(this.streamCursor+count>this.streamCapacity){
   gl.bufferData(gl.ARRAY_BUFFER,this.streamCapacity*STRIDE*4,gl.STREAM_DRAW);
   this.streamCursor=0;
  }
  gl.bufferSubData(gl.ARRAY_BUFFER,this.streamCursor*STRIDE*4,this.data,0,this.used);
  gl.drawArrays(gl.TRIANGLES,this.streamCursor,count);
  this.streamCursor+=count;
  this.metrics.drawCalls++;this.metrics.triangles+=this.used/(3*STRIDE);
  this.used=0;this.slots.length=0;
 }
 texture(w,h,mip=false,repeat=false,pixels=null,allocate=true){
  const gl=this.gl,t={handle:gl.createTexture(),w,h,last:this.serial,bytes:w*h*4*(mip?4/3:1),x:1,y:1,row:0};
  gl.activeTexture(gl.TEXTURE0+7);this.bound[7]=null;
  gl.bindTexture(gl.TEXTURE_2D,t.handle);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mip?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
  if(allocate)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  return t;
 }
 canPrepareSource(source){
  const w=source.naturalWidth??source.width,h=source.naturalHeight??source.height;
  return typeof createImageBitmap==='function'&&w>0&&h>0&&
   !this.preparedSources.has(source)&&this.preparedBytes+w*h*4<=this.preparedLimit;
 }
 prepareSource(source){
  if(!this.canPrepareSource(source))return;
  const bytes=(source.naturalWidth??source.width)*(source.naturalHeight??source.height)*4;
  this.preparedSources.set(source,null);
  this.preparedBytes+=bytes;
  createImageBitmap(source,{premultiplyAlpha:'premultiply'}).then(bitmap=>{
   this.preparedSources.set(source,bitmap);
  },()=>{
   this.preparedBytes-=bytes;
   // A failing source keeps its existing upload path.
  });
 }
 atlasCrop(source,x,y,w,h){
  const sw=source.naturalWidth??source.width,sh=source.naturalHeight??source.height;
  return Math.max(sw,sh)>=1024&&w*h<sw*sh/4&&[x,y,w,h].every(Number.isInteger)&&
   x>=0&&y>=0&&w>0&&h>0&&x+w<=sw&&y+h<=sh?[x,y,w,h]:null;
 }
 warmPreparedCrop(source,crop){
  if(this.lost||!this.preparedSources.get(source))return false;
  const entry=this.sources.get(source)?.get(crop.join(':'));
  if(entry?.blocked||entry?.t?.handle)return false;
  const uploads=this.metrics.uploads,bytes=this.metrics.uploadBytes;
  try{
   if(!this.upload(source,false,crop))return false;
   this.metrics.aheadUploads=(this.metrics.aheadUploads||0)+1;
   return true;
  }finally{
   this.metrics.uploads=uploads;this.metrics.uploadBytes=bytes;
  }
 }
 upload(source,repeat=false,crop=null){
  const [sx,sy,w,h]=crop||[0,0,source.naturalWidth??source.videoWidth??source.width,source.naturalHeight??source.videoHeight??source.height];
  if(!w||!h)return null;
  let entries=this.sources.get(source);
  if(!entries){entries=new Map();this.sources.set(source,entries);}
  const i=crop?crop.join(':'):repeat?1:0,old=entries.get(i);
  if(old?.blocked)return null;
  if(old?.t.handle && old.w===w && old.h===h){old.t.last=this.serial;return old;}
  const gl=this.gl,packed=!repeat&&w<=this.pageSize/2&&h<=this.pageSize/2;
  // Preserve pending draws before mutating a texture page or sampler binding.
  if(this.used)this.flush();
  let t,x=0,y=0;
  if(packed){
   for(const p of this.pages){
    if(!p.atlas)continue;
    const wrap=p.x+w+1>p.w,cx=wrap?1:p.x,cy=wrap?p.y+p.row:p.y;
    if(cy+h+1>p.h)continue;
    t=p;x=cx;y=cy;if(wrap){p.y=cy;p.row=0;}break;
   }
   if(!t){
    t=this.texture(this.pageSize,this.pageSize);t.atlas=true;this.pages.push(t);this.bytes+=t.bytes;x=y=1;
   }
   t.x=x+w+2;t.row=Math.max(t.row,h+2);
  }else{
   t=this.texture(w,h,true,repeat,null,false);
  }
  gl.activeTexture(gl.TEXTURE0+7);this.bound[7]=null;
  gl.bindTexture(gl.TEXTURE_2D,t.handle);
  const pixels=this.preparedSources.get(source)||source;
  try{
   if(crop){
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,sx);gl.pixelStorei(gl.UNPACK_SKIP_ROWS,sy);
    if(packed)gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   }else if(packed)gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  }catch(error){
   if(!packed){gl.deleteTexture(t.handle);t.handle=null;this.bound[7]=null;}
   if(error.name!=='SecurityError')throw error;
   entries.set(i,{blocked:true});return null;
  }finally{
   if(crop){gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,0);gl.pixelStorei(gl.UNPACK_SKIP_ROWS,0);}
  }
  if(!packed){gl.generateMipmap(gl.TEXTURE_2D);this.pages.push(t);this.bytes+=t.bytes;}
  this.metrics.uploadBytes+=w*h*4;this.metrics.uploads++;(this.metrics.uploadNames||(this.metrics.uploadNames=[])).push((source.currentSrc||source.src||'canvas').split('/').pop().split('?')[0]+' '+w+'x'+h);t.last=this.serial;
  const entry={t,x,y,w,h};entries.set(i,entry);return entry;
 }
 layer(w,h,draw){
  this.flush();
  const gl=this.gl,state=this.state,stack=this.stack,path=this.path,current=this.current;
  const t=this.texture(w,h);
  this.pages.push(t);this.bytes+=t.bytes;
  const framebuffer=this.framebuffer;
  gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.handle,0);
  gl.viewport(0,0,w,h);gl.uniform2f(this.size,w,h);
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.STENCIL_TEST);this.resetState();
  try{draw();this.flush();}
  finally{
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   gl.viewport(0,0,this.canvas.width,this.canvas.height);
   gl.uniform2f(this.size,this.canvas.width,this.canvas.height);
   this.state=state;this.stack=stack;this.path=path;this.current=current;this.applyClip();
  }
  return {texture:t};
 }
 drawLayer(layer,x,y,w,h){
  const t=layer.texture;
  t.last=this.serial;
  this.emit(this.quad(x,y,w,h),[1,1,1,this.state.globalAlpha],t,[[0,1],[1,1],[1,0],[0,1],[1,0],[0,0]]);
 }
 color(value){
  let c=this.colors.get(value);
  if(c)return c;
  if(typeof value!=='string')return WHITE;
  let x=value,n=x.length;
  if(x[0]==='#' && (n===4||n===5||n===7||n===9)){
   x=x.slice(1);if(n<=5)x=x.replace(/./g,k=>k+k);
   const v=parseInt(x,16);
   c=x.length===8?[(v>>>24)/255,(v>>>16&255)/255,(v>>>8&255)/255,(v&255)/255]:[(v>>>16)/255,(v>>>8&255)/255,(v&255)/255,1];
  }else if(/^rgba?\(/.test(x)){
   const a=x.slice(x.indexOf('(')+1,-1).split(',').map(Number);
   c=[clamp(a[0]/255),clamp(a[1]/255),clamp(a[2]/255),clamp(a[3]??1)];
  }else{
   const node=this.colorProbe||(this.colorProbe=document.createElement('span'));
   node.style.color='';node.style.color=value;
   if(!node.style.color)c=[0,0,0,1];
   else {if(!node.isConnected){node.style.display='none';document.documentElement.appendChild(node);}
    const resolved=getComputedStyle(node).color;
    const a=resolved.match(/[\d.]+/g)?.map(Number)||[0,0,0,1];
    c=[clamp(a[0]/255),clamp(a[1]/255),clamp(a[2]/255),clamp(a[3]??1)];
   }
  }
  if(this.colors.size>=4096)this.colors.delete(this.colors.keys().next().value);
  this.colors.set(value,c);return c;
 }
 ramp(style){
  const key=style.key||(style.key=JSON.stringify(style.stops));
  let texture=this.ramps.get(key);
  if(!texture){
   const pixels=new Uint8Array(256*4);
   const stops=style.stops.map(([at,c])=>{const [r,g,b,a]=this.color(c);return [at,r*a,g*a,b*a,a];});
   if(!stops.length)stops.push([0,0,0,0,0]);
   let j=0;
   for(let i=0;i<256;i++){
    const u=i/255;while(j+1<stops.length&&u>=stops[j+1][0])j++;
    const a=stops[j],b=stops[j+1]||a,t=a===b?0:clamp((u-a[0])/(b[0]-a[0]));
    for(let c=0;c<4;c++)pixels[i*4+c]=Math.round(255*(a[c+1]+t*(b[c+1]-a[c+1])));
   }
   texture=this.texture(256,1,false,false,pixels);texture.key=key;
   this.ramps.set(key,texture);this.pages.push(texture);this.bytes+=texture.bytes;this.metrics.uploads++;
  }
  texture.last=this.serial;return texture;
 }
 setBlend(mode){
  if(mode===this.blend)return;
  this.flush();this.blend=mode;
  const gl=this.gl;
  switch(mode){
   case 'lighter':gl.blendFunc(gl.ONE,gl.ONE);break;
   case 'screen':gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_COLOR);break;
   case 'clear':case 'destination-out':gl.blendFunc(gl.ZERO,gl.ONE_MINUS_SRC_ALPHA);break;
   default:gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  }
 }
 emit(vertices,color,t=null,uv=null,mode=0,radial=null,weights=null){
  if(!vertices.length||this.lost||color[3]<=0)return;
  this.setBlend(this.state.globalCompositeOperation);
  const d=this.data,{bounds:[left,top,right,bottom],clipTransform:m}=this.state,a=color[3],r=color[0]*a,g=color[1]*a,b=color[2]*a;
  const identity=m===ID,rad0=radial?.[0]??0,rad1=radial?.[1]||0,rad2=radial?.[2]||0,rad3=radial?.[3]||0;
  let slot=-1;
  const bindSlot=()=>{
   if(!t)return -1;
   let i=this.slots.indexOf(t);
   if(i<0){if(this.slots.length===8)this.flush();i=this.slots.length;this.slots.push(t);}
   return i;
  };
  slot=bindSlot();
  for(let i=0;i<vertices.length;i+=3){
   if(this.used+3*STRIDE>d.length){this.flush();slot=bindSlot();}
   for(let j=i;j<i+3;j++){
    const p=vertices[j],v=uv?.[j];let k=this.used;
    d[k++]=p[0];d[k++]=p[1];d[k++]=v?.[0]||0;d[k++]=v?.[1]||0;
    d[k++]=r;d[k++]=g;d[k++]=b;d[k++]=a;
    d[k++]=slot;d[k++]=mode;
    d[k++]=weights?.[j]??rad0;d[k++]=rad1;d[k++]=rad2;d[k++]=rad3;
    d[k++]=left;d[k++]=top;d[k++]=right;d[k++]=bottom;
    d[k++]=identity?p[0]:m[0]*p[0]+m[2]*p[1]+m[4];
    d[k++]=identity?p[1]:m[1]*p[0]+m[3]*p[1]+m[5];
    this.used=k;
   }
  }
 }
 paint(p,style){
  const alpha=this.state.globalAlpha;
  if(!alpha||!p.length)return;
  if(style instanceof Pattern){
   const inv=inverse(this.state.m);
   const uv=p.map(([x,y])=>point(style.inv,...point(inv,x,y)));
   this.textured(style.source,p,uv,true);
  }else if(style instanceof Gradient){
   const {args:a,inv,radial}=style;
   const dx=a[radial?3:2]-a[0],dy=a[radial?4:3]-a[1],dd=dx*dx+dy*dy||1;
   const uv=p.map(([x,y])=>{
    const q=point(inv,x,y);q[0]-=a[0];q[1]-=a[1];
    return radial?q:[(q[0]*dx+q[1]*dy)/dd,0];
   });
   this.emit(p,[1,1,1,alpha],this.ramp(style),uv,radial?2:1,radial?[dx,dy,a[2],a[5]-a[2]]:null);
  }else{
   const [r,g,b,a]=this.color(style);
   this.emit(p,[r,g,b,alpha*a]);
  }
 }
 toPoint(x,y){return point(this.state.m,x,y);}
 quad(x,y,w,h){
  const a=this.toPoint(x,y),b=this.toPoint(x+w,y),c=this.toPoint(x+w,y+h),d=this.toPoint(x,y+h);
  return [a,b,c,a,c,d];
 }
 polygon4(style,x0,y0,x1,y1,x2,y2,x3,y3){
  const a=this.toPoint(x0,y0),b=this.toPoint(x1,y1),c=this.toPoint(x2,y2),d=this.toPoint(x3,y3);
  this.paint([a,b,c,a,c,d],style);
 }
 textured(source,p,uv,repeat=false,crop=null,weights=null){
  const s=this.upload(source,repeat,crop);
  if(!s||s.blocked)return;
  const {t,x,y,w,h}=s;
  const coords=uv.map(([u,v])=>repeat?[u/w,v/h]:[
   (x+(t.atlas?Math.min(w-.5,Math.max(.5,u)):u))/t.w,
   (y+(t.atlas?Math.min(h-.5,Math.max(.5,v)):v))/t.h
  ]);
  this.emit(p,[1,1,1,this.state.globalAlpha],t,coords,weights?3:0,null,weights);
 }
 imagePanel(source,points,uv,near,far){
  const order=[0,1,2,0,2,3],w=near/far;
  const projected=points.map(([x,y])=>this.toPoint(x,y));
  this.textured(source,order.map(i=>projected[i]),order.map(i=>uv[i]),false,null,[1,1,w,1,w,w]);
 }
 material(source,x1,x2,x3,x4,y1,y2,m){
  const a=this.toPoint(x1,y1),b=this.toPoint(x2,y1),c=this.toPoint(x3,y2),d=this.toPoint(x4,y2);
  const inv=inverse(m),uv=[[x1,y1],[x2,y1],[x3,y2],[x1,y1],[x3,y2],[x4,y2]].map(([x,y])=>point(inv,x,y));
  this.textured(source,[a,b,c,a,c,d],uv,true);
 }
 drawImage(source,...args){
  if(!source||!this.state.globalAlpha)return;
  const w=source.naturalWidth??source.videoWidth??source.width,h=source.naturalHeight??source.videoHeight??source.height;
  if(!w||!h)return;
  let sx=0,sy=0,sw=w,sh=h,x,y,dw=w,dh=h;
  if(args.length===8)[sx,sy,sw,sh,x,y,dw,dh]=args;
  else if(args.length===4)[x,y,dw,dh]=args;
  else [x,y]=args;
  if(!sw||!sh||!dw||!dh||!Number.isFinite(x+y+sx+sy+sw+sh+dw+dh))return;
  if(dw<0){x+=dw;dw=-dw;}if(dh<0){y+=dh;dh=-dh;}
  if(sw<0){sx+=sw;sw=-sw;}if(sh<0){sy+=sh;sh=-sh;}
  const l=Math.max(0,-sx),r=Math.max(0,sx+sw-w),t=Math.max(0,-sy),b=Math.max(0,sy+sh-h);
  if(l+r>=sw||t+b>=sh)return;
  x+=dw*l/sw;y+=dh*t/sh;dw*=1-(l+r)/sw;dh*=1-(t+b)/sh;
  sx+=l;sy+=t;sw-=l+r;sh-=t+b;
  // V540: asynchronously resize individual sprite frames, never resample on the render thread.
  // Keep the original until its smaller variant is ready; use physical screen pixels.
  if(typeof createImageBitmap==='function'&&source instanceof HTMLImageElement&&sw>=64&&sh>=64&&[sx,sy,sw,sh].every(Number.isInteger)){
   const m=this.state.m,ratio=Math.max(dw*Math.hypot(m[0],m[1])/sw,dh*Math.hypot(m[2],m[3])/sh);
   const level=ratio<=.045?16:ratio<=.10?8:ratio<=.20?4:ratio<=.40?2:1;
   if(level>1){
    const cache=this.lodCache||(this.lodCache=new WeakMap());
    let entries=cache.get(source);if(!entries){entries=new Map();cache.set(source,entries);}
    const key=[sx,sy,sw,sh,level].join(':');
    let entry=entries.get(key);
    if(!entry)for(let finer=level/2;finer>=2;finer/=2){entry=entries.get([sx,sy,sw,sh,finer].join(':'));if(entry)break;}
    if(entry){
     const bw=entry.width,bh=entry.height;
     this.textured(entry,this.quad(x,y,dw,dh),[[0,0],[bw,0],[bw,bh],[0,0],[bw,bh],[0,bh]]);
     return;
    }
    if(!entries.has(key)&&!this.lodPending&&(this.lodBytes||0)<8*1024*1024){
     const bw=Math.max(1,Math.ceil(sw/level)),bh=Math.max(1,Math.ceil(sh/level)),bytes=bw*bh*4;
     if((this.lodBytes||0)+bytes<=8*1024*1024){
      entries.set(key,null);this.lodPending=true;this.lodBytes=(this.lodBytes||0)+bytes;
      const prepare=()=>createImageBitmap(source,sx,sy,sw,sh,{resizeWidth:bw,resizeHeight:bh,resizeQuality:'high',premultiplyAlpha:'premultiply'}).then(bitmap=>{entries.set(key,bitmap);},()=>{this.lodBytes-=bytes;}).finally(()=>{this.lodPending=false;});
      if(typeof requestIdleCallback==='function'){const idle=d=>{if(d.timeRemaining()>=5)prepare();else requestIdleCallback(idle);};requestIdleCallback(idle);}else {entries.delete(key);this.lodPending=false;this.lodBytes-=bytes;}
     }
    }
   }
  }
  // A large source sheet may contain hundreds of unrelated sprite frames.
  // Upload just the used frame straight from the decoded image to its GPU page.
  const crop=args.length===8?this.atlasCrop(source,sx,sy,sw,sh):null;
  if(crop){sx=0;sy=0;}
  this.textured(source,this.quad(x,y,dw,dh),[[sx,sy],[sx+sw,sy],[sx+sw,sy+sh],[sx,sy],[sx+sw,sy+sh],[sx,sy+sh]],false,crop);
 }
 createPattern(source){return source?.naturalWidth||source?.width?new Pattern(source):null;}
 createLinearGradient(...a){return new Gradient(false,this.state.m,a);}
 createRadialGradient(...a){return new Gradient(true,this.state.m,a);}
 fillRect(x,y,w,h){this.paint(this.quad(x,y,w,h),this.state.fillStyle);}
 clearRect(x,y,w,h){
  const mode=this.state.globalCompositeOperation;this.state.globalCompositeOperation='clear';
  this.emit(this.quad(x,y,w,h),WHITE);this.state.globalCompositeOperation=mode;
 }
 beginPath(){this.path=[];this.current=null;}
 moveTo(x,y){this.current={p:[this.toPoint(x,y)],closed:false};this.path.push(this.current);}
 lineTo(x,y){
  if(!this.current){this.moveTo(x,y);return;}
  if(this.current.closed){const p=this.current.p[0];this.current={p:[p],closed:false};this.path.push(this.current);}
  this.current.p.push(this.toPoint(x,y));
 }
 closePath(){if(this.current)this.current.closed=true;}
 rect(x,y,w,h){
  this.moveTo(x,y);this.lineTo(x+w,y);this.lineTo(x+w,y+h);this.lineTo(x,y+h);this.closePath();
  this.current.rectangle=[x,y,x+w,y+h];
  this.current.transform=this.state.m;
 }
 roundRect(x,y,w,h,r=0){
  r=Math.min(Math.abs(w)/2,Math.abs(h)/2,Array.isArray(r)?r[0]:r);
  if(r<=0){this.rect(x,y,w,h);return;}
  this.moveTo(x+r,y);this.arc(x+w-r,y+r,r,-Math.PI/2,0);
  this.arc(x+w-r,y+h-r,r,0,Math.PI/2);this.arc(x+r,y+h-r,r,Math.PI/2,Math.PI);
  this.arc(x+r,y+r,r,Math.PI,Math.PI*1.5);this.closePath();
 }
 arc(x,y,r,a,b,ccw=false){this.ellipse(x,y,r,r,0,a,b,ccw);}
 ellipse(x,y,rx,ry,rot,a,b,ccw=false){
  let delta=b-a;
  if(ccw){delta=delta<=-TAU?-TAU:(delta%TAU-TAU)%TAU;}
  else delta=delta>=TAU?TAU:(delta%TAU+TAU)%TAU;
  const m=this.state.m,scale=Math.max(Math.hypot(m[0],m[1]),Math.hypot(m[2],m[3]));
  const n=Math.max(1,Math.min(96,Math.ceil(Math.abs(delta)*Math.max(2,Math.sqrt(Math.max(rx,ry)*scale)))));
  const c=Math.cos(rot),s=Math.sin(rot);
  for(let i=0;i<=n;i++){
   const angle=a+delta*i/n,X=rx*Math.cos(angle),Y=ry*Math.sin(angle);
   this.lineTo(x+c*X-s*Y,y+s*X+c*Y);
  }
 }
 quadraticCurveTo(cx,cy,x,y){
  const b=this.toPoint(cx,cy),c=this.toPoint(x,y);
  if(!this.current)this.moveTo(cx,cy);
  const p=this.current.p,a=p[p.length-1],n=Math.max(3,Math.min(32,Math.ceil(Math.sqrt(Math.abs(cross(a,b,c)))*.45)));
  for(let i=1;i<=n;i++){const t=i/n,q=1-t;p.push([q*q*a[0]+2*q*t*b[0]+t*t*c[0],q*q*a[1]+2*q*t*b[1]+t*t*c[1]]);}
 }
 bezierCurveTo(x1,y1,x2,y2,x,y){
  const b=this.toPoint(x1,y1),c=this.toPoint(x2,y2),d=this.toPoint(x,y);
  if(!this.current)this.moveTo(x1,y1);
  const p=this.current.p,a=p[p.length-1],n=Math.max(5,Math.min(40,Math.ceil(Math.sqrt(Math.abs(cross(a,b,d))+Math.abs(cross(a,c,d)))*.45)));
  for(let i=1;i<=n;i++){
   const t=i/n,q=1-t;
   p.push([q**3*a[0]+3*q*q*t*b[0]+3*q*t*t*c[0]+t**3*d[0],q**3*a[1]+3*q*q*t*b[1]+3*q*t*t*c[1]+t**3*d[1]]);
  }
 }
 fill(){
  const p=this.path.flatMap(v=>triangles(v.p));
  const {shadowBlur,shadowColor}=this.state;
  if(shadowBlur>0&&p.length){
   const x=p.reduce((s,v)=>s+v[0],0)/p.length,y=p.reduce((s,v)=>s+v[1],0)/p.length;
   const scale=Math.max(Math.hypot(this.state.m[0],this.state.m[1]),1);
   const radius=shadowBlur*scale*2,grad=new Gradient(true,ID,[x,y,0,x,y,radius]);
   grad.addColorStop(0,shadowColor);grad.addColorStop(1,'transparent');
   this.paint([[x-radius,y-radius],[x+radius,y-radius],[x+radius,y+radius],[x-radius,y-radius],[x+radius,y+radius],[x-radius,y+radius]],grad);
  }
  this.paint(p,this.state.fillStyle);
 }
 stroke(){
  const {m,lineWidth,lineCap,lineJoin,dash}=this.state,inv=inverse(m),radius=lineWidth/2,out=[];
  const circle=(x,y)=>{
   const o=point(m,x,y),n=Math.max(8,Math.min(32,Math.ceil(radius*2)));
   for(let i=0;i<n;i++)out.push(o,point(m,x+radius*Math.cos(i*TAU/n),y+radius*Math.sin(i*TAU/n)),point(m,x+radius*Math.cos((i+1)*TAU/n),y+radius*Math.sin((i+1)*TAU/n)));
  };
  const segment=(x,y,X,Y,first,last)=>{
   const dx=X-x,dy=Y-y,l=Math.hypot(dx,dy);
   if(!l)return;
   const u=dx/l*radius,v=dy/l*radius;
   if(lineCap==='square'){if(first){x-=u;y-=v;}if(last){X+=u;Y+=v;}}
   const a=point(m,x-v,y+u),b=point(m,X-v,Y+u),c=point(m,X+v,Y-u),d=point(m,x+v,y-u);
   out.push(a,b,c,a,c,d);
   if(lineCap==='round'){if(first)circle(x,y);if(last)circle(X,Y);}
  };
  for(const {p,closed} of this.path){
   if(p.length<2)continue;
   const a=p.map(([x,y])=>point(inv,x,y));
   if(closed)a.push(a[0]);
   let index=0,remain=dash[0]||0;
   for(let j=1;j<a.length;j++){
    const [x,y]=a[j-1],[X,Y]=a[j];
    if(!dash.length){
     segment(x,y,X,Y,!closed&&j===1,!closed&&j===a.length-1);
     if(lineJoin==='round'&&(closed||j<a.length-1))circle(X,Y);
     continue;
    }
    const dx=X-x,dy=Y-y,L=Math.hypot(dx,dy);
    for(let t=0;t<L;){
     if(remain<=1e-7){index=(index+1)%dash.length;remain=dash[index];continue;}
     const n=Math.min(remain,L-t);
     if(!(index&1))segment(x+dx*t/L,y+dy*t/L,x+dx*(t+n)/L,y+dy*(t+n)/L,true,true);
     remain-=n;t+=n;
    }
   }
  }
  this.paint(out,this.state.strokeStyle);
 }
 strokeRect(x,y,w,h){const path=this.path,current=this.current;this.beginPath();this.rect(x,y,w,h);this.stroke();this.path=path;this.current=current;}
 setLineDash(values){const a=Array.from(values,x=>Math.max(0,x));this.state.dash=a.some(Boolean)?(a.length%2?a.concat(a):a):[];}
 // The exit aperture has identical screen geometry for every segment in this frame.
 clipPortal(key,x,y,radius,wallHeight){
  if(this.portalClip===key&&this.state.clip===0&&this.state.bounds===NO_CLIP){
   this.flush();this.state.clip=1;this.applyClip();
   return;
  }
  const firstLevel=this.state.clip===0&&this.state.bounds===NO_CLIP;
  this.beginPath();
  this.moveTo(x-radius,y);this.lineTo(x-radius,y-wallHeight);
  this.arc(x,y-wallHeight,radius,Math.PI,0);
  this.lineTo(x+radius,y);this.closePath();this.clip();
  if(firstLevel&&this.state.clip===1)this.portalClip=key;
 }
 clip(rule){
  const single=this.path.length===1?this.path[0]:null;
  const p=this.state.clipTransform===ID?single?.p:null;
  if(p?.length===4){
   const [a,b,c,d]=p;
   const axis=(a[0]===b[0]&&b[1]===c[1]&&c[0]===d[0]&&d[1]===a[1])||
    (a[1]===b[1]&&b[0]===c[0]&&c[1]===d[1]&&d[0]===a[0]);
   if(axis){
    const [l,t,r,h]=this.state.bounds;
    this.state.bounds=[Math.max(l,Math.min(a[0],c[0])),Math.max(t,Math.min(a[1],c[1])),
     Math.min(r,Math.max(a[0],c[0])),Math.min(h,Math.max(a[1],c[1]))];
    return;
   }
  }
  if(single?.rectangle&&this.state.bounds===NO_CLIP){
   const [x,y,X,Y]=single.rectangle;
   this.state.bounds=[Math.min(x,X),Math.min(y,Y),Math.max(x,X),Math.max(y,Y)];
   this.state.clipTransform=inverse(single.transform);
   return;
  }
  const old=this.state.clip,bit=2**Math.round(Math.log2(old+1));
  if(bit>128)return;
  if(bit===1)this.portalClip=null;
  const gl=this.gl;
  this.flush();gl.enable(gl.STENCIL_TEST);
  gl.stencilMask(bit);gl.clear(gl.STENCIL_BUFFER_BIT);
  gl.stencilFunc(gl.EQUAL,old|bit,old);
  gl.stencilOp(gl.KEEP,gl.KEEP,rule==='evenodd'?gl.INVERT:gl.REPLACE);
  gl.colorMask(false,false,false,false);
  for(const {p} of this.path)this.emit(triangles(p),WHITE);
  this.flush();gl.colorMask(true,true,true,true);
  this.state.clip=old|bit;this.applyClip();
 }
 applyClip(){
  const gl=this.gl,c=this.state.clip;
  if(c){gl.enable(gl.STENCIL_TEST);gl.stencilFunc(gl.EQUAL,c,c);gl.stencilOp(gl.KEEP,gl.KEEP,gl.KEEP);}
  else gl.disable(gl.STENCIL_TEST);
  gl.stencilMask(0);
 }
 save(){this.stack.push(this.state);this.state={...this.state};}
 restore(){
  if(!this.stack.length)return;
  const old=this.state.clip,next=this.stack.pop();
  if(old!==next.clip){this.flush();this.state=next;this.applyClip();}else this.state=next;
 }
 setTransform(a,b,c,d,e,f){this.state.m=[a,b,c,d,e,f];}
 transform(a,b,c,d,e,f){
  const m=this.state.m;
  this.setTransform(m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]);
 }
 translate(x,y){this.transform(1,0,0,1,x,y);}
 scale(x,y){this.transform(x,0,0,y,0,0);}
 rotate(a){const c=Math.cos(a),s=Math.sin(a);this.transform(c,s,-s,c,0,0);}
 glyphWidth(c){return c===' '?.32:/[ilI1.,:;!|]/.test(c)?.32:/[MW@%]/.test(c)?.9:/[mw]/.test(c)?.8:.62;}
 fontSize(){return Number(/([\d.]+)px/.exec(this.state.font)?.[1])||16;}
 measureText(value){const size=this.fontSize(),width=Array.from(String(value),c=>this.glyphWidth(c)*size).reduce((a,b)=>a+b,0);return {width,actualBoundingBoxLeft:0,actualBoundingBoxRight:width,actualBoundingBoxAscent:size*.8,actualBoundingBoxDescent:size*.2};}
 label(value,x,y,maxWidth,stroke){
  const s=this.state,text=String(value),im=this.glyphAtlas;
  if(!text||!Number.isFinite(x+y)||!im.complete||!im.naturalWidth)return;
  const a=this.upload(im);if(!a)return;
  const size=this.fontSize(),total=this.measureText(text).width,fit=maxWidth>0?Math.min(1,maxWidth/total):1;
  const align=s.textAlign==='center'?.5:s.textAlign==='right'||s.textAlign==='end'?1:0;
  let at=x-total*fit*align;
  const baseline=s.textBaseline==='top'||s.textBaseline==='hanging'?y+size*.8:s.textBaseline==='middle'?y+size*.3:s.textBaseline==='bottom'?y-size*.2:y;
  const [r,g,b,alpha]=this.color(stroke?s.strokeStyle:s.fillStyle),color=[r,g,b,alpha*s.globalAlpha];
  const offsets=stroke?Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/4)*s.lineWidth*.5,Math.sin(i*Math.PI/4)*s.lineWidth*.5]):[[0,0]];
  for(const c of text){const advance=this.glyphWidth(c)*size*fit;let i=this.glyphChars.indexOf(c);if(i<0)i=this.glyphChars.indexOf('?');
   if(c!==' '){const l=(a.x+i%16*64)/a.t.w,t=(a.y+Math.floor(i/16)*64)/a.t.h,R=l+64/a.t.w,B=t+64/a.t.h,w=size*64/44*fit,h=size*64/44;
    for(const [dx,dy] of offsets)this.emit(this.quad(at+advance/2-w/2+dx,baseline-size*48/44+dy,w,h),color,a.t,[[l,t],[R,t],[R,B],[l,t],[R,B],[l,B]]);
   }at+=advance;
  }
 }
 fillText(t,x,y,w){this.label(t,x,y,w,false);}
 strokeText(t,x,y,w){this.label(t,x,y,w,true);}
}
for(const key of ['fillStyle','strokeStyle','globalAlpha','globalCompositeOperation','lineWidth','lineCap','lineJoin','font','textAlign','textBaseline','shadowBlur','shadowColor']){
 Object.defineProperty(CoastWebGL2.prototype,key,{get(){return this.state[key];},set(v){this.state[key]=v;}});
}
window.CoastWebGL2=CoastWebGL2;
})();
