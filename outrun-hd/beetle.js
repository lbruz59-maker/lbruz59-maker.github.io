const beetleHD = window.beetleHD = (() => {
  const overlay = document.getElementById("hdCar");
  const game = document.getElementById("canvas");
  const enabled = document.getElementById("hdEnabled");
  const gl = overlay.getContext("webgl", {alpha:true, antialias:false, depth:false, premultipliedAlpha:true});
  const manifest = window.hdSprites;
  const textures = [];
  const draws = [];
  const colors = [[1,0,0],[0,.25,1],[1,.86,0],[0,.75,.1],[0,.84,.93],[1,.34,0],[.59,0,1],[1,.17,.57]];
  // Rear views in the original traffic table, including the alternate incline frames.
  const trafficViews = new Map();
  const rearAddresses = [
    [0xf3bc,0xf420,0xf484,0xf3ee,0xf452,0xf4b6],
    [0xf90c,0xf93e,0xf970],
    [0xf510,0xf574,0xf5d8,0xf542,0xf5a6,0xf60a],
    [0xf876,0xf8a8,0xf8da],
    [0xf290,0xf2f4,0xf358,0xf2c2,0xf326,0xf38a]
  ];
  rearAddresses.forEach((addresses,index)=>addresses.forEach((address,frame)=>{
    trafficViews.set(address,[index+1,frame%3]);
  }));
  const ferrariPalettes = [2,256,261,266,271,276,281,286];
  let mask, program, landscape;
  const u = {};
  let depthWidth = 0, depthHeight = 0;
  function shader(type,source) {
    const obj=gl.createShader(type);
    gl.shaderSource(obj,source);gl.compileShader(obj);
    if(!gl.getShaderParameter(obj,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(obj));
    return obj;
  }
  function newTexture(filter) {
    const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,filter);
    for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
    return t;
  }
  function init() {
    const vs=shader(gl.VERTEX_SHADER,`
      attribute vec2 corner;
      uniform vec4 dest,source;
      uniform vec2 screen;
      uniform float mirror;
      varying vec2 uv,local,world;
      void main(){
        world=(dest.xy+corner*dest.zw)/screen;
        local=vec2(mix(corner.x,1.-corner.x,mirror),corner.y);
        uv=source.xy+local*source.zw;
        gl_Position=vec4(world*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
      }`);
    const fs=shader(gl.FRAGMENT_SHADER,`
      precision highp float;
      uniform sampler2D atlas,depthMap;
      uniform float layer,phase,tint,brake;
      uniform vec3 paint;
      uniform vec4 source;
      varying vec2 uv,local,world;
      void main(){
        if(texture2D(depthMap,world).r*255. > layer+.4)discard;
        vec4 c=texture2D(atlas,uv);
        if(c.a<.01)discard;
        float lower=smoothstep(.80,.95,local.y);
        float tires=lower*(1.-smoothstep(.07,.21,max(c.r,max(c.g,c.b))));
        tires*=step(.17,abs(local.x-.5));
        if(phase>.5 && tires>.01){
          float stepY=phase*.25;
          vec3 tread=texture2D(atlas,uv-vec2(0.,stepY*.018*source.w)).rgb;
          float grooves=cos(6.28318*(local.y*16.+stepY+abs(local.x-.5)*3.));
          c.rgb=mix(c.rgb,clamp(tread,0.,.2)*.8+vec3(.095*smoothstep(.05,.8,grooves)),tires);
        }
        float red=c.r-max(c.g,c.b);
        if(tint>.5 && red>.075 && c.r>1.16*c.g && c.r>1.12*c.b)
          c.rgb=mix(c.rgb,min(c.g,c.b)+paint*(c.r-min(c.g,c.b)),smoothstep(.075,.19,red));
        if(brake>.5 && local.y>.43 && local.y<.58 && abs(local.x-.5)>.25 && red>.14)
          c.rgb=mix(c.rgb,vec3(1.,.17,.035),.43);
        gl_FragColor=vec4(c.rgb*c.a,c.a);
      }`);
    program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);
    gl.bindAttribLocation(program,0,"corner");gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    for(const name of ["dest","source","screen","mirror","layer","phase","tint","paint","brake","depthMap","atlas"])u[name]=gl.getUniformLocation(program,name);
    const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW);
    const corner=gl.getAttribLocation(program,"corner");gl.enableVertexAttribArray(corner);gl.vertexAttribPointer(corner,2,gl.FLOAT,false,0,0);
    gl.uniform1i(u.depthMap,1);gl.uniform1i(u.atlas,0);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    landscape=createLandscape(gl,shader,newTexture);
    mask=newTexture(gl.NEAREST);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    manifest.images.forEach((file,i)=>{
      const image=new Image();image.onload=()=>{
        gl.activeTexture(gl.TEXTURE0);const texture=newTexture(gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        textures[i]={texture,w:image.width,h:image.height};
      };image.src=file;
    });
  }
  if(gl){try{init();}catch(error){console.error(error);program=null;}}
  function queue(slot,address,x,y,w,h,flip,model,turn,paint,wheel,palette,top,bottom) {
    const localCar=paint>=0;
    const variant=palette-manifest.trafficPalette;
    const rivalModel=!localCar && variant>=0 && variant<80 ? 1+Math.floor((variant%40)/8) : 0;
    const trafficView=paint<=-2 ? trafficViews.get(address) : null;
    const bodyModel=model||rivalModel||trafficView?.[0];
    const angle=trafficView ? trafficView[1] : Math.abs(turn);
    const f=manifest.frames[bodyModel ? "car"+bodyModel+"-"+angle : address===0x1085c ? "lights"+Math.max(0,Math.min(3,palette-122)) : address];
    if(!f || !textures[f[0]] || w<3 || h<2)return 0;
    const kind=f[9],car=kind==="car"||kind==="ferrari"||kind==="traffic";
    if(model){
      x+=w*.065;w*=.87;
      flip=turn>0;
    }
    if(localCar && paint>7)paint=0;
    if(!localCar && car){
      if(rivalModel){paint=variant%8;flip=turn!==0 && !flip;}
      else if(trafficView){paint=-paint-2;flip=angle!==0 && !flip;}
      else if(kind==="ferrari")paint=ferrariPalettes.findIndex(p=>palette>=p && palette<p+4);
    }
    if(localCar && car)api.pose=[x,y,w,h,turn,paint,wheel];
    const left=flip?1-f[5]-f[7]:f[5];
    draws.push({slot:slot+1,f,x:x+w*left,y:y+h*f[6],w:w*f[7],h:h*f[8],flip,paint:car?paint:0,
      wheel:car?wheel:0,brake:kind==="ferrari" && paint>=0 && palette-ferrariPalettes[paint]>=2 && palette-ferrariPalettes[paint]<4,top,bottom});
    return 1;
  }
  function present(heap,ptr,W,H,bytes,depthPtr,...road){
    const depth=bytes.subarray(depthPtr,depthPtr+W*H);
    for(let i=0;i<depth.length;i++){
      const value=heap[ptr+i];if(!(value&32768))depth[i]=255;
      heap[ptr+i]=value&32767;
    }
    if(!draws.length && !(road[0]>=0)){overlay.hidden=true;return;}
    const rect=game.getBoundingClientRect(),scale=Math.min(rect.width/W,rect.height/H);
    const sw=W*scale,sh=H*scale,dpr=Math.min(window.devicePixelRatio||1,2560/Math.max(1,sw));
    const bw=Math.max(1,Math.round(sw*dpr)),bh=Math.max(1,Math.round(sh*dpr));
    overlay.hidden=false;
    if(overlay.width!==bw || overlay.height!==bh){overlay.width=bw;overlay.height=bh;}
    Object.assign(overlay.style,{width:sw+"px",height:sh+"px",left:(rect.width-sw)/2+"px",top:(rect.height-sh)/2+"px"});
    gl.viewport(0,0,bw,bh);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    if(road[0]>=0)landscape.render(heap,ptr,W,H,bytes,depth,road);
    gl.useProgram(program);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mask);
    if(depthWidth!==W||depthHeight!==H){
      gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,W,H,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,depth);
      depthWidth=W;depthHeight=H;
    }else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,W,H,gl.LUMINANCE,gl.UNSIGNED_BYTE,depth);
    gl.activeTexture(gl.TEXTURE0);gl.uniform2f(u.screen,W,H);gl.enable(gl.SCISSOR_TEST);
    for(const d of draws){
      const f=d.f,t=textures[f[0]];
      gl.bindTexture(gl.TEXTURE_2D,t.texture);
      gl.uniform4f(u.dest,d.x,d.y,d.w,d.h);gl.uniform4f(u.source,(f[1]+.5)/t.w,(f[2]+.5)/t.h,(f[3]-1)/t.w,(f[4]-1)/t.h);
      gl.uniform1f(u.layer,d.slot);gl.uniform1f(u.mirror,+!!d.flip);gl.uniform1f(u.phase,d.wheel);
      gl.uniform3fv(u.paint,colors[d.paint]||colors[0]);gl.uniform1f(u.tint,+(d.paint>0 && d.paint<8));gl.uniform1f(u.brake,+!!d.brake);
      const low=Math.max(0,Math.floor((H-d.bottom)*bh/H)),high=Math.min(bh,Math.ceil((H-d.top)*bh/H));
      gl.scissor(0,low,bw,Math.max(0,high-low));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    }
  }
  const api={get ready(){return !!program && !gl.isContextLost() && enabled.checked && textures.some(Boolean);},
    pose:null,queue,present,begin(){draws.length=0;api.pose=null;if(!api.ready)overlay.hidden=true;return +api.ready;}};
  return api;
})();
