"""Build Coast Rush sprite data from the checked-in transparent source artwork."""
from pathlib import Path
import json, re, math
from collections import defaultdict
from PIL import Image, ImageFilter
import numpy as np

ROOT=Path(__file__).resolve().parent
html=(ROOT/'test-hd-v583.html').read_text('utf8')
dest=ROOT/'poses-v584'
dest.mkdir(exist_ok=True)
atlas=json.loads((ROOT/'sprites.js').read_text('utf8').split('=',1)[1].split('};',1)[0]+'}')
anchors={}
marshal=[]
models={}
palette=['ff2a2a','2a6aff','ffd400','2ecc40','ff8800','c03aff','00cccc','ffffff','ff69b4','111111']
layouts={k:json.loads(re.sub(r'(?<!\d)\.', '0.',v)) for k,v in re.findall(r'^(\w+):(\[\[.*?\]\])',html.split('const cr98TireLayout=')[1].split('};')[0],re.M)}
frames=defaultdict(list)
for f in atlas['frames'].values():
    frames[atlas['images'][f[0]]].append(f[1:5])
def record(key,alpha):
    h,w=alpha.shape
    hits=np.flatnonzero((alpha>80).sum(axis=1)>=max(2,math.ceil(w*.015)))
    if hits.size and hits[-1]+1!=h: anchors[key]=round(float(hits[-1]+1)/h,6)
for path in ROOT.rglob('*.webp'):
    if dest in path.parents: continue
    name=path.relative_to(ROOT).as_posix()
    with Image.open(path) as im:
        if 'A' not in im.getbands(): continue
        alpha=np.asarray(im.getchannel('A'))
        record(name,alpha)
        w,h=im.size
        rects=frames[name]
        if path.stem in ('skyline_modern','skyline_international','residences','facades_mediterranee','monuments','mobilier_urbain'):
            count=6 if path.stem=='monuments' else 8
            for i in range(count):
                x=math.floor(w*i/count+.5);rects.append([x,0,math.floor(w*(i+1)/count+.5)-x,h])
        if 'nature' in path.stem:
            rects.extend([[round(i*w/4),round(j*h/3),round(w/4),round(h/3)] for i in range(4) for j in range(3)])
        for x,y,rw,rh in rects:
            record(name+'|'+','.join(map(str,[x,y,rw,rh])),alpha[y:y+rh,x:x+rw])
for key in range(68526,68617,10):
    sheet,x,y,w,h,*_=atlas['frames'][str(key)]
    im=Image.open(ROOT/atlas['images'][sheet]).convert('RGBA').crop((x,y,x+w,y+h))
    r,g,b,a=np.moveaxis(np.array(im).astype(float),2,0)
    yy,xx=np.nonzero((a>170)&(r>90)&(r>g*1.5)&(r>b*1.35)&(r-g>40))
    cx,cy=xx.mean(),yy.mean(); left,right=max(0,int(cx-30)),min(w,math.ceil(cx+30)+1)
    hats=np.nonzero(((a>120)&(r>100)&(g>65)&(r>g*.95)&(g>b*1.28)&(r>b*1.55))[:int(cy),left:right])[0]
    hat=int(hats.min()) if len(hats)>=5 else max(0,int(yy.min())-36)
    foot=int(np.flatnonzero(((a[:,left:right]>150).sum(1)>=4))[-1])
    marshal.append(dict(cx=round(cx,3),hat=hat,foot=foot,body=foot-hat))
for model in sorted(p.stem[:-2] for p in (ROOT/'v88-vehicles').glob('*-0.webp')):
    poses=[]
    garage=Image.new('RGBA',(128*len(palette),96*3))
    for pose in range(3):
        im=Image.open(ROOT/'v88-vehicles'/f'{model}-{pose}.webp').convert('RGBA')
        box=im.getchannel('A').point(lambda a:255 if a>=40 else 0).getbbox()
        im=im.crop(box)
        original=np.array(im)
        h,w=original.shape[:2];y,x=np.ogrid[:h,:w]
        rgb=original[:,:,:3].astype(float);r,g,b=rgb.transpose(2,0,1);hi=rgb.max(2);sat=(hi-rgb.min(2))/np.maximum(hi,1)
        mask=(original[:,:,3]>=110)&(hi>=48)&(sat>=.24)
        if model in ('sidecar','chopper','motosport','scooter','motocross','motoroute'):mask &= y>=h*(.67 if model=='sidecar' else .61)
        mask &= ~((r>g*1.65)&(r>b*1.65)&(y>h*.73)&((x<w*.26)|(x>w*.74)))
        weight=(mask*np.clip((sat-.24)*2.5,0,.92))[:,:,None]
        for i,col in enumerate(palette):
            target=np.array(bytes.fromhex(col) and list(bytes.fromhex(col)))/255
            luma=.24*r+.66*g+.1*b
            colored=original.copy();colored[:,:,:3]=np.clip(rgb*(1-weight)+luma[:,:,None]*1.55*target*weight,0,255)
            thumb=Image.fromarray(colored);thumb.thumbnail((126,94),Image.Resampling.LANCZOS)
            garage.paste(thumb,(i*128+(128-thumb.width)//2,pose*96+95-thumb.height))
        poses.append([])
        for phase in range(4):
            data=original.copy()
            if phase:
                for fx,fy,rx,ry in layouts.get(model,layouts['sport']):
                    cx=w*(fx+(pose-1)*.012);cy=h*fy
                    mask=(((x-cx)/(w*rx*.48))**2+((y-cy)/(h*ry*.79))**2<1)&(hi<115)&(sat<.55)&(original[:,:,3]>128)
                    shade=np.where(((y+phase*2)%8)<2,17,-5)
                    data[:,:,:3]=np.clip(rgb+(mask*shade)[:,:,None],0,255)
            poses[-1].append(Image.fromarray(data))
    garage.save(dest/f'{model}-garage.webp',quality=83,method=3)
    width=max(p[0].width for p in poses);height=max(p[0].height for p in poses)
    sheet=Image.new('RGBA',((width+2)*4,(height+2)*3))
    models[model]=[]
    for i,row in enumerate(poses):
        models[model].append([row[0].width,row[0].height])
        for phase,img in enumerate(row):sheet.paste(img,(phase*(width+2),i*(height+2)))
    sheet.save(dest/f'{model}.webp',lossless=True,method=2)
(ROOT/'sprite-data-v584.js').write_text('window.coastSpriteData='+json.dumps(dict(anchors=anchors,marshal=marshal,models=models,palette=palette),separators=(',',':'))+';',encoding='utf8')
