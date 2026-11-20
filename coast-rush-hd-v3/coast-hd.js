(()=>{"use strict";
const atlas=window.hdSprites, images=atlas.images.map(src=>{const i=new Image();i.src=src;return i}), ready=i=>i&&i.complete&&i.naturalWidth>0;
function draw(g,key,x,y,w,h,flip=false){const f=atlas.frames[key];if(!f||!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1||!ready(images[f[0]]))return false;g.save();g.translate(x,y);if(flip)g.scale(-1,1);g.drawImage(images[f[0]],f[1],f[2],f[3],f[4],-w/2,-h,w,h);g.restore();return true}
function natural(g,k,x,y,h,flip=false,maxW=Infinity){const f=atlas.frames[k];if(!f)return false;const w=Math.min(maxW,h*f[3]/f[4]);return draw(g,k,x,y,w,w*f[4]/f[3],flip)}
function drawCar(g,x,y,w,c,model,lean){const pose=Math.min(2,Math.round(Math.abs(lean||0))),flip=lean>0;const k=model===6?['62006','62016','62026'][pose]:'car'+model+'-'+pose;const f=atlas.frames[k];if(!f||!ready(images[f[0]])||w<2)return false;const h=w*f[4]/f[3];if(model!==6)return draw(g,k,x,y,w,h,flip);if(!ready(images[5]))return false;
g.save();g.translate(x,y);if(flip)g.scale(-1,1);
draw(g,k,0,0,w,h);
const riderKey=['69826','69816','69806'][pose],r=atlas.frames[riderKey];const rw=w*.73,rh=rw*r[4]/r[3];draw(g,riderKey,pose*w*.035,-h*.64,rw,rh);
g.restore();return true}
const marshal=['68526','68536','68546','68556','68566','68576','68586','68596','68606','68616'];
function drawMarshal(g,x,y,h,t,active){return natural(g,marshal[active?Math.floor(t*9)%marshal.length:0],x,y,h)}
const variants={p:['64456','64706','64756'],c:['64856','64906','64806'],t:['64256','64556','64656'],a:['64206','64356','64406','64506'],n:['64256','64606','64956'],eu:[],u:['64136','64166','64176','64186','64806','65106','65156'],r:['67216','67266','68176','68276','68326','68376'],h:['67776','67826'],ch:['67776','67826'],cl:['64096','64106','65006'],gs:['64126'],rt:['67776'],cf:['67826']};
const factor={p:1,c:1.25,t:.7,a:.55,n:1,u:.35,r:.25,h:.94,ch:.65,cl:.7,gs:.65,rt:.65,cf:.65};
function choose(sp,arr){const seed=Math.abs(Math.floor((Number(sp.o)||0)*173+(Number(sp.hh)||0)*31+(Number(sp.z)||0)*7));return arr[seed%arr.length]}
function drawScenery(g,sp,x,y,s,sc,H,roadW){const list=variants[sp.t];if(!list||!list.length||s<2)return false;const key=choose(sp,list);let h=s*(factor[sp.t]||1);if(sp.t==='h')h=sc*900*160*1.68*((sp.hh||1)*.9+.35);const side=Math.abs(Number(sp.o)||0);const maxW=side>1?Math.max(2,sc*roadW*160*(side-1)*1.8):s*.6;return natural(g,key,x,y,h,Number(sp.o)>0,maxW)}
const local={rock:['67216','68276','68376'],oli:['64506','64556'],cot:['67776'],hau:['67826'],hut:['67776'],fair:['67976']};
function drawLocal(g,sp,x,y,s){const keys=local[sp.k];if(!keys||!keys.length)return false;const k=choose(sp,keys),height=s*(sp.k==='fair'?32:sp.k==='rock'?5:12);return natural(g,k,x,y,height,Number(sp.o)>0)}
function drawCrash(g,x,y,w,t){const k=['70436','70446','70456','70466','70476','70486','70496'][Math.floor(t*12)%7];const f=atlas.frames[k];if(!f)return false;const ok=draw(g,k,x,y,w,w*f[4]/f[3]);if(ok){natural(g,'63186',x-w*.55,y-w*.3,w*.35);natural(g,'63216',x+w*.55,y-w*.25,w*.35)}return ok}
window.CRHD={draw,drawCar,drawMarshal,drawScenery,drawLocal,drawCrash,atlas,images};})();