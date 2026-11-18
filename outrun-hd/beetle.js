const beetleHD = window.beetleHD = (() => {
  const overlay = document.getElementById("hdCar");
  const game = document.getElementById("canvas");
  const ctx = overlay.getContext("2d");
  const enabled = document.getElementById("hdEnabled");
  const atlas = new Image();
  const frames = [[42,71,605,595],[733,77,670,588],[1446,82,718,583]];
  const paints = [0,220,50,123,185,27,275,329];
  const textures = new Map();
  atlas.src = "./beetle.png";

  function texture(view, paint) {
    const key = view * 8 + paint;
    if (textures.has(key)) return textures.get(key);
    const [sx,sy,w,h] = frames[view];
    const panel = document.createElement("canvas");
    panel.width = w; panel.height = h;
    const brush = panel.getContext("2d");
    brush.drawImage(atlas,sx,sy,w,h,0,0,w,h);
    if (paint) {
      const data = brush.getImageData(0,0,w,h);
      const hue = paints[paint] / 60;
      const second = 1 - Math.abs(hue % 2 - 1);
      const rgb = [[1,second,0],[second,1,0],[0,1,second],[0,second,1],[second,0,1],[1,0,second]][Math.floor(hue)];
      for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
        const i=4*(y*w+x), p=data.data, low=Math.min(p[i+1],p[i+2]), range=p[i]-low;
        if (!p[i+3] || range<18 || p[i]<p[i+1]*1.18 || p[i]<p[i+2]*1.12) continue;
        // Keep the two rear lamp lenses red as body paint changes.
        const nx=x/w, ny=y/h;
        const lamps=[[.16,.85],[.32,.91],[.48,.96]][view];
        if(ny>.56 && ny<.75 && lamps.some(cx=>((nx-cx)/.049)**2+((ny-.66)/.085)**2<1)) continue;
        for(let k=0;k<3;k++) p[i+k]=low+range*rgb[k];
      }
      brush.putImageData(data,0,0);
    }
    textures.set(key,panel);
    return panel;
  }

  function present(heap,ptr,W,H) {
    if(!api.pose){overlay.hidden=true;return;}
    const [x,y,w,h,turn,paint,phase]=api.pose;
    const rect=game.getBoundingClientRect();
    const scale=Math.min(rect.width/W,rect.height/H);
    const dpr=window.devicePixelRatio||1;
    const bw=Math.max(1,Math.round(w*scale*dpr)), bh=Math.max(1,Math.round(h*scale*dpr));
    overlay.hidden=false;
    Object.assign(overlay.style,{
      left:((rect.width-W*scale)/2+x*scale)+"px",top:((rect.height-H*scale)/2+y*scale)+"px",
      width:w*scale+"px",height:h*scale+"px"
    });
    if(overlay.width!==bw || overlay.height!==bh){overlay.width=bw;overlay.height=bh;}
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,bw,bh);
    const pic=texture(Math.abs(turn),paint);
    ctx.save();
    if(turn>0){ctx.translate(bw,0);ctx.scale(-1,1);}
    ctx.drawImage(pic,0,0,bw,bh);
    // Shift narrow bands inside the rubber while leaving the contact patch fixed.
    if(phase) {
      const zones=[[[.06,.12],[.82,.11]],[[.025,.05],[.19,.08],[.86,.085]],[[.025,.04],[.23,.075],[.87,.06]]][Math.abs(turn)];
      for(const [l,span] of zones) for(let band=0;band<3;band++){
        const sy=.86+band*.026;
        ctx.drawImage(pic,l*pic.width,(sy+.011)*pic.height,span*pic.width,.012*pic.height,l*bw,sy*bh,span*bw,.012*bh);
      }
    }
    ctx.restore();
    // Preserve foreground sprites and text drawn after the car in the arcade renderer.
    for(let row=0;row<h;row++){
      let start=-1;
      for(let col=0;col<=w;col++){
        const visible=col<w && x+col>=0 && x+col<W && y+row>=0 && y+row<H;
        const addr=ptr+(y+row)*W+x+col;
        const marked=visible && (heap[addr]&0x8000);
        if(marked) heap[addr]&=0x7fff;
        if(col<w && !marked){if(start<0)start=col;}
        else if(start>=0){const a=Math.round(start*bw/w),b=Math.round(row*bh/h);ctx.clearRect(a,b,Math.round(col*bw/w)-a,Math.round((row+1)*bh/h)-b);start=-1;}
      }
    }
  }
  const api={get ready(){return enabled.checked && atlas.complete && atlas.naturalWidth>0;},pose:null,present};
  return api;
})();
