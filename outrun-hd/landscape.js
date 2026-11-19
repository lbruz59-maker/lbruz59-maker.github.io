/* HD materials for the road chip and the distant tile layers. Coordinates are
   taken from Cannonball's scanlines so each fork and crest keeps its shape. */
function createLandscape(gl, compile, newTexture) {
  const courseIds=[0x3c,0x1e,0x3b,0x20,0x2f,0x2a,0x2d,0x35,0x33,0x21,0x32,0x23,0x38,0x22,0x26];
  const panoramas=new Map();
  let currentSky, previousSky, skyChanged=0;
  let asphalt, verge, scene, rows, program, uniforms, pixels, rowData, width=0,height=0;
  const palette=new Uint32Array(8192);
  function load(url,repeat=false) {
    const asset={texture:null};
    const img=new Image();
    img.onload=()=>{
      gl.activeTexture(gl.TEXTURE0);
      const texture=newTexture(gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img);
      if(repeat){
        for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.REPEAT);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      }
      asset.texture=texture;
    };
    img.src=url;return asset;
  }
  function panorama(id){
    let index=courseIds.indexOf(id);
    if(index<0)index=id===0x25?1:id===0x19?2:0;
    if(!panoramas.has(index))panoramas.set(index,load("./distance-"+index+".webp"));
    return panoramas.get(index).texture;
  }
  const vert=compile(gl.VERTEX_SHADER,`
    attribute vec2 corner; varying vec2 uv;
    void main(){uv=corner;gl_Position=vec4(corner*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);}`);
  const frag=compile(gl.FRAGMENT_SHADER,`
    precision highp float;
    varying vec2 uv;
    uniform sampler2D surface,panorama,asphalt,scanline,verge,priorSky;
    uniform vec2 size;
    uniform float horizon,heading,travel,transition;
    void main(){
      vec4 sampleData=texture2D(surface,uv);
      float type=floor(sampleData.a*255.+.5);
      if(type<.5)discard;
      if(type<1.5){
        float u=.5+(uv.x-.5)*size.x/size.y*.21+heading;
        float v=.96+(uv.y-horizon)*min(1.5,.93/max(horizon,.01));
        vec2 skyUV=vec2(1.-abs(mod(u,2.)-1.),clamp(v,0.,1.));
        vec3 sky=mix(texture2D(priorSky,skyUV).rgb,texture2D(panorama,skyUV).rgb,transition);
        gl_FragColor=vec4(sky,1.);return;
      }
      vec4 line=texture2D(scanline,vec2(.5,uv.y));
      float z=max(line.b,.018);
      float center=(line.r*65280.+line.g*255.-32768.)/8.;
      vec2 roadUV=vec2(((uv.x-.5)*size.x-center)/(z*115.),1.65/z+travel);
      vec3 aggregate=texture2D(asphalt,roadUV).rgb;
      float grain=dot(aggregate,vec3(.299,.587,.114));
      vec3 rgb=sampleData.rgb;
      if(type<2.5){
        // Reconstruct the edge of lane paint between arcade scanlines.
        vec2 texel=1./size;
        vec2 pos=uv*size-.5, part=fract(pos), base=(floor(pos)+.5)*texel;
        vec4 a=texture2D(surface,base), b=texture2D(surface,base+vec2(texel.x,0.));
        vec4 c=texture2D(surface,base+vec2(0.,texel.y)), d=texture2D(surface,base+texel);
        vec3 top=mix(abs(a.a*255.-2.)<.4?a.rgb:rgb,abs(b.a*255.-2.)<.4?b.rgb:rgb,smoothstep(.1,.9,part.x));
        vec3 bottom=mix(abs(c.a*255.-2.)<.4?c.rgb:rgb,abs(d.a*255.-2.)<.4?d.rgb:rgb,smoothstep(.1,.9,part.x));
        rgb=mix(top,bottom,part.y);
        float lum=dot(rgb,vec3(.299,.587,.114));
        float paint=smoothstep(.70,.94,lum);
        float path=abs(fract(roadUV.x*1.22)-.5)-.26;
        float tracks=exp(-14.*path*path);
        vec3 bitumen=mix(rgb,vec3(.47),.45)*.54+vec3(.02,.025,.03);
        float wear=texture2D(asphalt,roadUV*vec2(.23,.047)).r;
        bitumen*=1.06-.12*tracks+.45*(wear-.37);
        rgb=mix(bitumen,rgb,paint)*(.47+grain*1.93);
      }else{
        vec2 cell=rgb.g>rgb.r*1.06?vec2(1.,0.):rgb.r>.67 && rgb.g>.53?vec2(0.):rgb.r>rgb.b*1.45?vec2(1.):vec2(0.,1.);
        vec2 coord=cell*.5+(.006+.988*fract(roadUV*.68))*.5;
        vec3 grass=texture2D(verge,coord).rgb;
        vec3 material=mix(rgb,grass,.55);
        rgb=rgb.b>rgb.r*1.19?rgb*(.88+.4*grain):material;
      }
      gl_FragColor=vec4(rgb,1.);
    }`);
  program=gl.createProgram();gl.attachShader(program,vert);gl.attachShader(program,frag);
  gl.bindAttribLocation(program,0,"corner");gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  uniforms=Object.fromEntries(["size","horizon","travel","heading","surface","panorama","asphalt","scanline","verge","priorSky","transition"].map(n=>[n,gl.getUniformLocation(program,n)]));
  scene=newTexture(gl.NEAREST);rows=newTexture(gl.LINEAR);verge=load('./verges.webp');asphalt=load("./pavement.webp",true);panorama(courseIds[0]);
  let lastPosition, travel = 0;
  function render(heap,ptr,W,H,bytes,depth,params){
    const [stage,pal,yPtr,xPtr,position,heading]=params;
    if(stage<0){lastPosition=undefined;travel=0;return;}
    const distance=position>>>0;
    if(lastPosition!==undefined && distance>=lastPosition)travel=(travel+(distance-lastPosition)/1048576)%1;
    lastPosition=distance;
    if(!asphalt.texture || !verge.texture)return;
    const next=panorama(stage);
    const now=performance.now();
    if(next && next!==currentSky){previousSky=currentSky||next;currentSky=next;skyChanged=now;}
    if(!currentSky)return;
    const resized=W!==width||H!==height;
    if(resized){width=W;height=H;pixels=new Uint32Array(W*H);rowData=new Uint8Array(H*4);}
    const scale=H/224;
    for(let index=0x400;index<0x440;index++){
      const color=bytes[pal+2*index]*256+bytes[pal+2*index+1];
      const channel=(shift)=>Math.round((((color>>shift&15)*2)+(color>>(12+shift/4)&1))*255/31);
      const r=channel(0),g=channel(4),b=channel(8);
      const material=index<0x410?2:3;
      palette[index]=(material<<24)|(b<<16)|(g<<8)|r;
      palette[index+4096]=(material<<24)|(Math.round(b*.64)<<16)|(Math.round(g*.64)<<8)|Math.round(r*.64);
    }
    let firstRoad=H;
    for(let i=0;i<pixels.length;i++){
      const value=heap[ptr+i],base=value&4095;
      if(depth[i] || value>=8192){pixels[i]=0;continue;}
      if(base>=0x400 && base<0x440){
        pixels[i]=palette[value];
        if(i<firstRoad*W)firstRoad=Math.floor(i/W);
      }else pixels[i]=base<0x400 || (base>=0x780 && base<0x800)?0x01000000:0;
    }
    if(firstRoad===H)firstRoad=Math.round(H*.64);
    const setRow=(y,z,x)=>{
      const val=Math.max(0,Math.min(65535,32768+Math.round(x*scale*8)));
      rowData[4*y]=val>>8;rowData[4*y+1]=val&255;rowData[4*y+2]=Math.max(1,z>>1);rowData[4*y+3]=255;
    };
    rowData.fill(0);
    let previous=-1;
    for(let z=1;z<512;z++){
      const y=Math.min(H-1,Math.max(0,Math.round(scale*(223-((heap[yPtr+z]<<16>>16)>>4)))));
      const x=heap[xPtr+z]<<16>>16;
      for(let line=Math.min(previous+1,y);line<=y;line++)setRow(line,z,x);
      previous=y;
    }
    for(let y=previous+1;y<H;y++)setRow(y,511,heap[xPtr+511]<<16>>16);
    const upload=(unit,tex,w,h,data)=>{
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex);
      if(resized)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
      else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);
    };
    gl.useProgram(program);
    upload(2,scene,W,H,new Uint8Array(pixels.buffer));upload(3,rows,1,H,rowData);
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,currentSky);
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,asphalt.texture);
    gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,verge.texture);
    gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,previousSky);
    gl.uniform1f(uniforms.transition,Math.min(1,(now-skyChanged)/480));
    for(const [name,unit] of [["surface",2],["scanline",3],["panorama",4],["asphalt",5],["verge",6],["priorSky",7]])gl.uniform1i(uniforms[name],unit);
    gl.uniform2f(uniforms.size,W,H);gl.uniform1f(uniforms.horizon,firstRoad/H);
    gl.uniform1f(uniforms.heading,heading/1024);
    gl.uniform1f(uniforms.travel,travel);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
  return {render};
}
