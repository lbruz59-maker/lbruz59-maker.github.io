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
  const fittings=[
    [[.10,.43,.89,.43,.078,.033],[.12,.43,.89,.43,.075,.033],[.15,.43,.88,.43,.073,.033]],
    [[.067,.46,.94,.46,.036,.067],[.33,.46,.947,.46,.032,.068],[.48,.46,.95,.46,.029,.069]],
    [[.14,.65,.86,.65,.044,.060],[.34,.65,.91,.65,.038,.061],[.49,.65,.94,.65,.033,.057]],
    [[.15,.52,.84,.52,.11,.052],[.37,.52,.87,.52,.087,.05],[.51,.52,.91,.52,.07,.05]],
    [[.20,.46,.80,.46,.115,.069],[.31,.46,.85,.46,.10,.065],[.52,.46,.90,.46,.077,.064]],
    [[.12,.62,.87,.62,.080,.045],[.35,.62,.92,.62,.066,.040],[.53,.62,.94,.62,.055,.040]]
  ];
  // Visible near wheel and far wheel (centre and radii), gentle and hard steering.
  const hubs=[
    [[.13,.86,.024,.085,.02,.77,.013,.056],[.19,.85,.032,.089,.028,.76,.018,.062]],
    [[.24,.81,.029,.095,.074,.69,.021,.083],[.35,.81,.041,.109,.063,.69,.022,.083]],
    [[.22,.84,.033,.095,.065,.73,.024,.078],[.36,.82,.042,.112,.055,.68,.026,.083]],
    [[.20,.82,.031,.098,.045,.71,.018,.067],[.31,.80,.042,.122,.061,.69,.025,.080]],
    [[.18,.82,.030,.103,.038,.69,.018,.075],[.27,.80,.040,.116,.045,.64,.023,.081]],
    [[.18,.81,.030,.106,.041,.66,.018,.07],[.30,.77,.038,.124,.055,.64,.022,.081]]
  ];
  const noHub=[0,0,0,0,0,0,0,0];
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
      uniform float mirror,roll;
      varying vec2 uv,local,world;
      void main(){
        vec2 offset=(corner-.5)*dest.zw;
        float c=cos(roll),s=sin(roll);
        world=(dest.xy+.5*dest.zw+mat2(c,s,-s,c)*offset)/screen;
        local=vec2(mix(corner.x,1.-corner.x,mirror),corner.y);
        uv=source.xy+local*source.zw;
        gl_Position=vec4(world*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
      }`);
    const fs=shader(gl.FRAGMENT_SHADER,`
      precision highp float;
      uniform sampler2D atlas,depthMap;
      uniform float layer,phase,tint,brake;
      uniform vec3 paint;
      uniform vec4 lamps,hubA,hubB;
      uniform vec2 lampSize;
      varying vec2 uv,local,world;
      float spokes(vec4 hub){
        if(hub.z<=0.)return 0.;
        vec2 p=(local-hub.xy)/hub.zw;
        float radius=length(p);
        if(radius>=1.)return 0.;
        float angle=atan(p.y,p.x+.00001);
        float spoke=smoothstep(.42,.9,cos(angle*5.-phase*1.5707963));
        return (.12+.57*spoke)*smoothstep(.10,.36,radius)*(1.-smoothstep(.8,1.,radius));
      }
      uniform vec4 source;
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
        float rim=max(spokes(hubA),spokes(hubB));
        c.rgb=mix(c.rgb,vec3(.69,.72,.73),rim*(1.-smoothstep(.075,.21,max(c.r,c.b)-c.g)));
        vec2 la=(local-lamps.xy)/lampSize,lb=(local-lamps.zw)/lampSize;
        float lamp=1.-smoothstep(.83,1.12,min(length(la),length(lb)));
        float red=c.r-max(c.g,c.b);
        float reflector=lamp;
        lamp*=smoothstep(.025,.17,red);
        if(tint>.5 && red>.075 && c.r>1.16*c.g && c.r>1.12*c.b)
          c.rgb=mix(c.rgb,min(c.g,c.b)+paint*(c.r-min(c.g,c.b)),smoothstep(.075,.19,red)*(1.-lamp));
        if(brake>.5){
          float glow=max(.70*reflector,lamp);
          c.rgb=mix(c.rgb,vec3(1.,.105+.22*lamp,.035),glow);
        }
        gl_FragColor=vec4(c.rgb*c.a,c.a);
      }`);
    program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);
    gl.bindAttribLocation(program,0,"corner");gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    for(const name of ["dest","source","screen","roll","mirror","layer","phase","hubA","hubB","lamps","lampSize","tint","paint","brake","depthMap","atlas"])u[name]=gl.getUniformLocation(program,name);
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
  let skyVisible=false;
  function queue(slot,address,x,y,w,h,flip,model,turn,paint,wheel,palette,top,bottom,scale,braking,roll=0) {
    // The native cloud routine uses eight distance variants and palette CD.
    // The HD panoramas already contain their own sky and cloud layer.
    if(palette===0xcd && address>=72656 && address<=72726 && (address-72656)%10===0)
      return skyVisible ? 1 : 0;
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
    const view=Math.min(2,angle);
    const equipped=!!bodyModel || kind==="ferrari";
    const lamps=equipped ? fittings[bodyModel||0][view] : [-2,-2,-2,-2,1,1];
    const hub=equipped && view ? hubs[bodyModel||0][view-1] : noHub;
    if(localCar && car)api.pose=[x,y,w,h,turn,paint,wheel,!!braking];
    const left=flip?1-f[5]-f[7]:f[5];
    draws.push({slot:slot+1,f,x:x+w*left,y:y+h*f[6],w:w*f[7],h:h*f[8],flip,paint:car?paint:0,
      wheel:car?wheel:0,brake:equipped && braking,lamps,hub,roll,top,bottom});
    return 1;
  }
  function present(heap,ptr,W,H,bytes,depthPtr,...road){
    api.roadVisible=road[0]>=0;
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
    skyVisible=road[0]>=0 && landscape.render(heap,ptr,W,H,bytes,depth,road);
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
      gl.uniform1f(u.roll,d.roll*Math.PI/180);gl.uniform1f(u.layer,d.slot);gl.uniform1f(u.mirror,+!!d.flip);gl.uniform1f(u.phase,d.wheel);
      const l=d.lamps,h=d.hub;
      gl.uniform4f(u.lamps,l[0],l[1],l[2],l[3]);gl.uniform2f(u.lampSize,l[4],l[5]);
      gl.uniform4f(u.hubA,h[0],h[1],h[2],h[3]);gl.uniform4f(u.hubB,h[4],h[5],h[6],h[7]);
      gl.uniform3fv(u.paint,colors[d.paint]||colors[0]);gl.uniform1f(u.tint,+(d.paint>0 && d.paint<8));gl.uniform1f(u.brake,+!!d.brake);
      const low=Math.max(0,Math.floor((H-d.bottom)*bh/H)),high=Math.min(bh,Math.ceil((H-d.top)*bh/H));
      gl.scissor(0,d.roll?0:low,bw,d.roll?bh:Math.max(0,high-low));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    }
  }
  const api={get ready(){return !!program && !gl.isContextLost() && enabled.checked && textures.some(Boolean);},
    roadVisible:false,pose:null,queue,present,begin(){draws.length=0;api.pose=null;if(!api.ready)overlay.hidden=true;return +api.ready;}};
  return api;
})();
