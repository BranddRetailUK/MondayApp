"""Offline, reference-only digital fidelity evaluation; never used by generation.

Requires pyembroidery, numpy, scipy, Pillow. Millimetres, one global translation
only (no per-letter warping or rescaling). Each colour stage must independently
reach 90% silhouette IoU, local axial direction agreement and thread-length
density agreement. All movements are decoded from the actual exported files.
"""
import argparse,json,math
from pathlib import Path
import numpy as np
import pyembroidery as pe
from scipy.ndimage import gaussian_filter,binary_closing
from PIL import Image,ImageDraw

CELL=.25
SMOOTH_MM=1.0

def read(file):
    p=pe.read(str(file));last=np.array([0.,0.]);colour=0;segments=[];jumps=0;short=0
    for x,y,command in p.stitches:
        c=command&255;q=np.array([x,y])/10
        if c==pe.COLOR_CHANGE:colour+=1
        if c==pe.JUMP:jumps+=1
        if c==pe.STITCH:
            length=float(np.linalg.norm(q-last))
            if length>1e-8:
                segments.append([*last,*q,colour]);short+=length<.5
        last=q
    s=np.array(segments);points=np.concatenate([s[:,:2],s[:,2:4]])
    lo=points.min(axis=0);hi=points.max(axis=0);centre=(lo+hi)/2
    s[:,:2]-=centre;s[:,2:4]-=centre
    return s,{'stitches':len(s),'widthMm':float(hi[0]-lo[0]),'heightMm':float(hi[1]-lo[1]),'colourStages':colour+1,'jumpCommands':jumps,'shortStitches':short}

def fields(segments,shape,origin):
    length=np.zeros(shape);cos=np.zeros(shape);sin=np.zeros(shape)
    image=Image.new('L',(shape[1]*2,shape[0]*2));draw=ImageDraw.Draw(image)
    for x,y,a,b,_ in segments:
        delta=np.array([a-x,b-y]);distance=float(np.linalg.norm(delta));n=max(1,math.ceil(distance/.1))
        pts=np.array([x,y])+(np.arange(n)[:,None]+.5)/n*delta
        indices=np.floor((pts-origin)/CELL).astype(int);ix,iy=indices.T
        angle=math.atan2(delta[1],delta[0]);weight=distance/n
        np.add.at(length,(iy,ix),weight);np.add.at(cos,(iy,ix),weight*math.cos(2*angle));np.add.at(sin,(iy,ix),weight*math.sin(2*angle))
        ends=(np.array([[x,y],[a,b]])-origin)/CELL*2
        draw.line([tuple(p) for p in ends],fill=255,width=3)
    silhouette=np.asarray(image.resize((shape[1],shape[0]),Image.Resampling.BOX))>64
    silhouette=binary_closing(silhouette,iterations=1)
    return silhouette,tuple(gaussian_filter(f,SMOOTH_MM/CELL) for f in (length,cos,sin))

def evaluate(candidate,reference):
    a,actual=read(candidate);b,expected=read(reference)
    points=np.concatenate([a[:,:2],a[:,2:4],b[:,:2],b[:,2:4]])
    origin=np.floor((points.min(axis=0)-3)/CELL)*CELL
    shape=tuple((np.ceil((points.max(axis=0)+3-origin)/CELL).astype(int)+1)[::-1])
    reports=[]
    for colour in range(max(actual['colourStages'],expected['colourStages'])):
        sa,fa=fields(a[a[:,4]==colour],shape,origin);sb,fb=fields(b[b[:,4]==colour],shape,origin)
        intersection=sa&sb;union=sa|sb
        coverage=float(intersection.sum()/max(1,union.sum()))
        da,ca,xa=fa;db,cb,xb=fb
        angle=np.abs(np.arctan2(xa*cb-ca*xb,ca*cb+xa*xb))/2
        strength=np.hypot(ca,xa)/np.maximum(da,1e-9)
        angle[strength<.05]=math.pi/2
        weights=sb.astype(float)*np.clip(np.hypot(cb,xb)/np.maximum(db,1e-9),.1,1)
        direction=float(1-(angle*weights).sum()/max(1e-9,weights.sum())/(math.pi/2))
        density=float(1-np.abs(da-db).sum()/max(1e-9,(da+db).sum()))
        reports.append({'stage':colour+1,'silhouette':round(coverage*100,3),'direction':round(direction*100,3),'density':round(density*100,3)})
    minimum=min(r[k] for r in reports for k in ['silhouette','direction','density'])
    gates={'colourSequence':actual['colourStages']==expected['colourStages'],'size':max(abs(actual[k]-expected[k]) for k in ['widthMm','heightMm'])<=1,'shortStitches':actual['shortStitches']/actual['stitches']<=.05}
    return {'method':'physical-field-v1','cellMm':CELL,'directionDensityWindowMm':SMOOTH_MM,'registration':'one translation aligning global sewn-bounds centres; no scale/warp','actual':actual,'reference':expected,'stages':reports,'minimumScore':minimum,'gates':gates,'passed':minimum>=90 and all(gates.values()),'scope':'digital shape/direction/density fidelity, not physical sew-out approval'}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('candidate');parser.add_argument('reference');parser.add_argument('output');args=parser.parse_args()
    result=evaluate(args.candidate,args.reference);Path(args.output).write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
