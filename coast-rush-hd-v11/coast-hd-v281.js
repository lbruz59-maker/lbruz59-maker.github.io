(()=>{"use strict";
const atlas=window.hdSprites, images=atlas.images.map(src=>{const i=new Image();i.onerror=()=>{if(!i.dataset.retry){i.dataset.retry='1';i.src=new URL('../coast-rush-hd-v9/'+src,document.baseURI).href}else console.error('HD texture unavailable',src)};i.src=new URL(src,document.baseURI).href;return i}), ready=i=>i&&i.complete&&i.naturalWidth>0;
function draw(g,key,x,y,w,h,flip=false){const f=atlas.frames[key];if(!f||!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1||!ready(images[f[0]]))return false;if(!flip){g.drawImage(images[f[0]],f[1],f[2],f[3],f[4],x-w/2,y-h,w,h)}else{g.save();g.translate(x,y);g.scale(-1,1);g.drawImage(images[f[0]],f[1],f[2],f[3],f[4],-w/2,-h,w,h);g.restore()}return true}
function natural(g,k,x,y,h,flip=false,maxW=Infinity){const f=atlas.frames[k];if(!f)return false;const w=Math.min(maxW,h*f[3]/f[4]);return draw(g,k,x,y,w,w*f[4]/f[3],flip)}
function drawCar(g,x,y,w,c,model,lean){const pose=Math.min(2,Math.round(Math.abs(lean||0))),flip=model===6?lean<0:lean>0;const k=model===6?[['62026','62006','62016'],['62056','62036','62046'],['62086','62066','62076']][pose][window.CRHD.grade>.15?1:window.CRHD.grade<-.15?2:0]:'car'+model+'-'+pose;const f=atlas.frames[k],base=atlas.frames[model===6?'62026':'car'+model+'-0'];if(!f||!base||!ready(images[f[0]])||w<2)return false;
const h=model===6?w*base[4]/base[3]:w*base[4]/base[3],ww=model===6?w:h*f[3]/f[4];if(model!==6)return draw(g,k,x,y,ww,h,flip);
// V179: Ferrari distante et adversaires : personnages obligatoires, meme si les frames de tete chargent tard.
const wind=(window.CRHD.motion||0)>.1&&Math.floor(performance.now()/140)%2;
const heads=[wind?'69926':'69916',wind?'69956':'69946'];
g.save();g.translate(x,y);
draw(g,k,0,0,ww,h,flip);
for(let n=0;n<2;n++){
 const hk=heads[n],hf=atlas.frames[hk],rh=h*(n===0?.24:.27),px=(n===0?-.17:.17)*ww+(flip?-1:1)*pose*.035*ww,py=-h*.76;
 if(hf&&ready(images[hf[0]])){draw(g,hk,px,py,rh*hf[3]/hf[4],rh);continue;}
 // Silhouette de secours stable pour ne jamais laisser une Ferrari adverse vide.
 const r=Math.max(.5,rh*.27);g.fillStyle=n===0?'#392b25':'#e5bd63';
 g.beginPath();g.ellipse(px,py-rh*.55,r*1.12,r*1.2,0,0,Math.PI*2);g.fill();
 g.fillStyle='#e9b895';g.beginPath();g.ellipse(px,py-rh*.43,r*.78,r*.92,0,0,Math.PI*2);g.fill();
 g.fillStyle=n===0?'#345575':'#f1d4a5';g.fillRect(px-r*1.2,py-rh*.18,r*2.4,rh*.32);
}
g.restore();return true}
const marshal=['68526','68536','68546','68556','68566','68576','68586','68596','68606','68616'];
function drawMarshal(g,x,y,h,t,active){return natural(g,marshal[active?((Math.floor(Math.max(0,t)*10)%marshal.length)):0],x,y,h)}
const variants={p:['64456','64706','64756'],c:['64856','64906','64806'],t:['64256','64556','64656'],a:['64206','64306','64356','64406','64506'],n:['64256','64606','64956','65056','69246','69346','70946','66716','66766','67626','67016','69446'],eu:[],u:['64056','64136','64146','64156','64166','64176','64186','64806','65106','65156','69006','69026'],r:['67216','67266','68176','68226','68276','68326','68376','64116','64066'],h:['67776','67826'],ch:['67776','67826'],cl:['64096','64106','65006','64076','68426','68476','68126','68026','68076'],gs:['64126','67876'],rt:['67776'],cf:['67826']};
const factor={p:1,c:1.25,t:.7,a:.55,n:1,u:.35,r:.25,h:.94,ch:.65,cl:.7,gs:.65,rt:.65,cf:.65};
function choose(sp,arr){const seed=Math.abs(Math.floor((Number(sp.o)||0)*173+(Number(sp.hh)||0)*31+(Number(sp.z)||0)*7));return arr[seed%arr.length]}
function drawScenery(g,sp,x,y,s,sc,H,roadW,city){const desert=/DESERT|SAHARA|DUNE|EGYPT|MAROC|MOROCCO|DUBAI|NEVADA|ARIZONA/i.test(city||'');const rockyHighlands=/ALPS|ALPES|MOUNTAIN|ROCKY|HIGHLAND|PYRENEES|DOLOMIT/i.test(city||'');const coastal=/COAST|COTE|CÔTE|RIVIERA|MEDITERR|MÉDITERR|PORT|MARSEILLE|NICE|CANNES/i.test(city||'');const list=sp.t==='r'?(desert?['68996',...variants.r]:rockyHighlands?['68986','64086',...variants.r]:variants.r):sp.t==='u'&&coastal?['68696','69016',...variants.u]:sp.t==='n'&&coastal?['66666','66816','66866','66916','66966',...variants.n]:variants[sp.t];if(!list||!list.length||s<2)return false;const key=choose(sp,list);let h=s*(factor[sp.t]||1);if(sp.t==='h')h=sc*900*160*1.68*((sp.hh||1)*.9+.35);const side=Math.abs(Number(sp.o)||0);const maxW=side>1?Math.max(2,sc*roadW*160*(side-1)*1.8):s*.6;return natural(g,key,x,y,h,!['h','ch','gs','rt','cf'].includes(sp.t)&&Number(sp.o)>0,maxW)}
const local={rock:['67216','68176','68226','68276','68376'],oli:['64506','64556'],cot:['67776'],hau:['67826'],hut:['67776'],fair:['67976']};
function drawLocal(g,sp,x,y,s){const keys=local[sp.k];if(!keys||!keys.length)return false;const k=choose(sp,keys),height=s*(sp.k==='fair'?32:sp.k==='rock'?5:12);return natural(g,k,x,y,height,!['cot','hau','hut','fair'].includes(sp.k)&&Number(sp.o)>0)}
let crashStart=0,crashLast=0,crashDir=1;
function drawCrash(g,x,y,w,remaining){const now=performance.now();if(now-crashLast>180||!crashStart){crashStart=now;crashDir=Math.random()<.5?-1:1}crashLast=now;const t=Math.max(0,(now-crashStart)/1000),p=Math.min(1,t/.85),seq=['70496','70486','70436','70446','70456','70466','70476'],k=p>=1?'62026':seq[Math.floor(t*18)%seq.length],f=atlas.frames[k];if(!f)return false;const bounce=Math.abs(Math.sin(p*Math.PI*3))*w*.32*(1-p);const ok=draw(g,k,x+crashDir*w*.22*Math.sin(p*Math.PI),y-bounce,w,w*f[4]/f[3],crashDir<0);if(ok){const driver=['63216','63226','63236','63266','63276','63286','63296'],pass=['63186','63196','63206','63326','63336','63346','63356'];const i=Math.min(6,Math.floor(p*7)),lift=Math.sin(Math.PI*p)*w*.65;natural(g,driver[i],x-w*(.22+p*.7),y-lift,w*.42);natural(g,pass[i],x+w*(.22+p*.7),y-lift*.85,w*.42)}return ok}
window.CRHD={draw,drawCar,drawMarshal,drawScenery,drawLocal,drawCrash,atlas,images};})();