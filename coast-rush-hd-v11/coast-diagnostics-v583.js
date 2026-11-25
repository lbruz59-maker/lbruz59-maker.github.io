// Opt in with ?gpuTrace=1. Ring buffer intentionally bounds retained diagnostics.
if(new URLSearchParams(location.search).has('gpuTrace')){
  const events=window.coastGPUTrace=[];
  const record=(type,data)=>{if(events.length===2048)events.splice(0,512);events.push([performance.now(),type,data]);};
  const create=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){
    const gl=create.call(this,type,...args);record('context',[type,this.id,!!gl]);
    if(gl && type==='webgl2' && !gl.__crTrace){
      gl.__crTrace=true;
      for(const name of ['texImage2D','texSubImage2D','bufferData','readPixels']){
        const fn=gl[name];gl[name]=function(...a){const t=performance.now(),v=fn.apply(this,a);
          record(name,[a[2]?.byteLength||a[2],typeof a[3]==='number'?a[3]:0,typeof a[4]==='number'?a[4]:0,a.at(-1)?.naturalWidth||0,performance.now()-t,this.getError()]);return v;};
      }
      for(const e of ['webglcontextlost','webglcontextrestored'])this.addEventListener(e,()=>record(e,this.id));
      new ResizeObserver(()=>record('canvas',[this.width,this.height])).observe(this);
    }return gl;
  };
  document.addEventListener('visibilitychange',()=>record('visibility',document.visibilityState));
}
