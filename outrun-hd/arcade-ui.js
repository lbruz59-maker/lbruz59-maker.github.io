// Draw both arcade text planes at display resolution, retaining the game's tile timing and palette.
window.arcadeUI = (() => {
  const layers = ["scoreTiles","hudTiles"].map(id => {
    const canvas=document.getElementById(id);
    return {canvas,ctx:canvas.getContext("2d"),previous:null,colors:""};
  });
  const cache=new Map();
  function smooth(src,n) {
    const dst=new Uint8Array(n*n*4);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const i=y*n+x,e=src[i],b=y?src[i-n]:e,h=y+1<n?src[i+n]:e;
      const d=x?src[i-1]:e,f=x+1<n?src[i+1]:e,j=(y*2*n*2+x*2);
      const edge=b!==h && d!==f;
      dst[j]=edge&&d===b?d:e;dst[j+1]=edge&&b===f?f:e;
      dst[j+2*n]=edge&&d===h?d:e;dst[j+2*n+1]=edge&&h===f?f:e;
    }
    return dst;
  }
  const carTiles=new Map();
  [[0x17d,0x17e,0x17f,0x180,0x181],[0x160,0x161,0x162,0x163,0x164],
   [0x182,0x183,0x184,0x185,0x186],[0x170,0x171,0x172,0x173,0x174],
   [0x187,0x188,0x189,0x18a,0x1e6],[0x165,0x166,0x167,0x168,0x169],
   [0x175,0x176,0x177,0x178,0x179]].forEach((row,model)=>row.forEach((code,i)=>{
    carTiles.set(code,{model,offset:[0,-1,.5,-.5,-1.5][i]});
  }));
  function drawMiniature(ctx,part){
    const colors=["#ec302c","#ffbf28","#c84167","#69b9f0","#e16b28","#a9c8ce","#81ba5a"];
    ctx.save();ctx.scale(6,6);ctx.translate(part.offset*8,0);
    ctx.fillStyle="#1e252b";ctx.beginPath();ctx.ellipse(8,6.7,7.5,.62,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=colors[part.model];ctx.strokeStyle="#39272a";ctx.lineWidth=.23;
    ctx.beginPath();ctx.moveTo(.45,5.75);ctx.quadraticCurveTo(.6,4.1,3.2,3.85);
    ctx.lineTo(5.5,3.55);ctx.lineTo(7.2,1.48);ctx.lineTo(10.75,1.48);
    ctx.lineTo(12.65,3.35);ctx.lineTo(15.45,3.25);ctx.lineTo(15.18,5.9);
    ctx.quadraticCurveTo(8,6.68,.45,5.75);ctx.fill();ctx.stroke();
    ctx.fillStyle="#264454";ctx.beginPath();ctx.moveTo(6.12,3.55);ctx.lineTo(7.4,1.87);
    ctx.lineTo(10.4,1.87);ctx.lineTo(11.95,3.36);ctx.closePath();ctx.fill();
    ctx.fillStyle="#ffeabe";ctx.fillRect(.85,4.55,1.55,.41);
    for(const x of [3.5,12.5]){
      ctx.fillStyle="#141820";ctx.beginPath();ctx.arc(x,5.8,1.36,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#c0c8ce";ctx.beginPath();ctx.arc(x,5.8,.65,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function glyph(words,bytes,tilePtr,pal,code,bank) {
    const inks=[[0,0,0,0]],pixels=new Uint8Array(64);
    for(let i=1;i<8;i++){
      const p=pal+2*((bank+i)&4095),v=bytes[p]*256+bytes[p+1];
      const channel=s=>Math.round(255*((v>>s&15)*2+(v>>(12+s/4)&1))/31);
      inks.push([channel(0),channel(4),channel(8),255]);
    }
    const signature=Array.from(words.subarray(tilePtr+8*code,tilePtr+8*code+8)).join(".");
    const key=code+":"+signature+":"+inks.join(".");
    if(cache.has(key))return cache.get(key);
    let brightest=0,color=null;
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const v=words[tilePtr+8*code+y]>>>(28-4*x)&7;
      pixels[8*y+x]=v;
      const [r,g,b]=inks[v],brightness=r+g+b;
      if(v && brightness>brightest){brightest=brightness;color=inks[v];}
    }
    const c=document.createElement("canvas");c.width=c.height=48;
    const ctx=c.getContext("2d"),glyph=code&255;
    const letter=(glyph>=65 && glyph<=90)||(glyph>=48 && glyph<=57);
    if(carTiles.has(code)){
      drawMiniature(ctx,carTiles.get(code));
    }else if(code>=0x17a && code<=0x17c){
      const i=code-0x17a;
      for(let j=0;j<3;j++){
        const x=9+j*15,y=28+5*Math.sin(j+i),r=(8+j*2)*(1-i*.18);
        const smoke=ctx.createRadialGradient(x,y,1,x,y,r);
        smoke.addColorStop(0,"rgba(235,239,240,"+(.69-i*.14)+")");smoke.addColorStop(1,"rgba(180,193,200,0)");
        ctx.fillStyle=smoke;ctx.fillRect(x-r,y-r,2*r,2*r);
      }
    }else if(color && letter && code<512){
      ctx.font="900 45px system-ui, sans-serif";ctx.textAlign="center";ctx.textBaseline="alphabetic";
      ctx.lineJoin="round";ctx.lineWidth=4;ctx.strokeStyle="#11151e";
      ctx.strokeText(String.fromCharCode(glyph),24,40,43);
      ctx.fillStyle="rgb("+color.slice(0,3).join(",")+")";ctx.fillText(String.fromCharCode(glyph),24,40,43);
    }else{
      const data=smooth(smooth(pixels,8),16),raw=document.createElement("canvas");raw.width=raw.height=32;
      const rc=raw.getContext("2d"),im=rc.createImageData(32,32);
      for(let i=0;i<data.length;i++)im.data.set(inks[data[i]],i*4);
      rc.putImageData(im,0,0);ctx.drawImage(raw,0,0,48,48);
    }
    if(cache.size>2048)cache.clear();
    cache.set(key,c);return c;
  }
  function render(bytes,words,records,count,tilePtr,pal,W,H,split){
    const rect=document.getElementById("canvas").getBoundingClientRect(),scale=Math.min(rect.width/W,rect.height/H);
    const w=scale*W,h=scale*H,dpr=Math.min(devicePixelRatio||1,2560/Math.max(1,w));
    for(let n=0;n<2;n++){
      const {canvas,ctx}=layers[n];const from=n?split:0,to=n?count:split;
      canvas.hidden=from===to;
      if(canvas.hidden){layers[n].previous=null;continue;}
      Object.assign(canvas.style,{width:w+"px",height:h+"px",left:(rect.width-w)/2+"px",top:(rect.height-h)/2+"px"});
      const bw=Math.max(1,Math.round(w*dpr)),bh=Math.max(1,Math.round(h*dpr));
      const resized=canvas.width!==bw||canvas.height!==bh;
      if(resized){canvas.width=bw;canvas.height=bh;}
      const entries=words.subarray(records+4*from,records+4*to);
      const palette=Array.from(bytes.subarray(pal,pal+(n?128:2048))).join(".");
      const last=layers[n].previous;
      if(!resized && last && last.length===entries.length && palette===layers[n].colors && entries.every((v,i)=>last[i]===v))continue;
      layers[n].previous=entries.slice();layers[n].colors=palette;
      ctx.setTransform(bw/W,0,0,bh/H,0,0);ctx.clearRect(0,0,W,H);
      for(let i=0;i<entries.length;i+=4)
        ctx.drawImage(glyph(words,bytes,tilePtr,pal,entries[i+2],entries[i+3]),entries[i]|0,entries[i+1]|0,8,8);
    }
  }
  return {render,get ready(){return !!window.beetleHD?.roadVisible && layers.every(l=>l.ctx);},hide(){for(const l of layers){l.canvas.hidden=true;l.previous=null;}}};
})();
