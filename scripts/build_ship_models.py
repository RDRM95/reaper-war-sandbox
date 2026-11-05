"""Generate original game-inspired low/mid-poly GLB spacecraft.

Reference URLs / provenance: docs/SHIP_AND_AUDIO_REFERENCES.md.
No game mesh, texture, or ripped sound is used. Geometric interpretation only.
Requires: pip install trimesh numpy shapely (development only).
Run: python scripts/build_ship_models.py
World convention: +X bow, +Z dorsal, +Y starboard.
"""
from __future__ import annotations
from pathlib import Path
import json, math
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'public/assets/ships'
DEST.mkdir(parents=True,exist_ok=True)

# Original, intentionally restrained release-era palettes.
ALLIANCE=(114,140,158,255); ARMOUR=(72,91,107,255); SILVER=(154,171,181,255)
DARK=(27,39,50,255); SHADE=(46,59,70,255); BLUE=(38,104,151,255)
BLUE_LIGHT=(60,168,255,255); WHITE=(198,208,209,255); RED=(145,54,54,255)
CERBERUS=(180,185,184,255); CERBERUS_DARK=(61,65,69,255); ORANGE=(217,111,40,255)
REAPER=(45,47,62,255); REAPER_MID=(67,67,84,255); REAPER_DARK=(23,24,36,255); REAPER_HIGHLIGHT=(88,82,101,255)
RED_LIGHT=(255,48,65,255)


def from_poly(points:list[tuple[float,float]], thickness=.10,z=0.0, top_scale=1., bot_scale=1.) -> trimesh.Trimesh:
    # Ear clipping independent of external triangulation wheels. Paths are simple polygons.
    points=np.array(points,dtype=float)
    n=len(points)
    def area(poly):return np.sum(poly[:,0]*np.roll(poly[:,1],-1)-np.roll(poly[:,0],-1)*poly[:,1])*.5
    if area(points)<0:points=points[::-1]
    ids=list(range(n));faces=[]
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    def inside(p,a,b,c):
        c1=cross(a,b,p);c2=cross(b,c,p);c3=cross(c,a,p)
        return c1>=-1e-8 and c2>=-1e-8 and c3>=-1e-8
    guard=0
    while len(ids)>3 and guard<150:
        guard+=1;made=False
        for k in range(len(ids)):
            i0,i1,i2=ids[k-1],ids[k],ids[(k+1)%len(ids)]
            a,b,c=points[i0],points[i1],points[i2]
            if cross(a,b,c)<1e-9:continue
            if any(inside(points[j],a,b,c) for j in ids if j not in (i0,i1,i2)):continue
            faces.append([i0,i1,i2]);del ids[k];made=True;break
        if not made:break
    if len(ids)==3:faces.append(ids)
    if not faces:
        # Fallback used only for obviously convex paths.
        faces=[[0,i,i+1] for i in range(1,n-1)]
    centre=np.mean(points,axis=0)
    top=np.c_[centre+(points-centre)*top_scale,np.full(n,z+thickness/2)]
    bottom=np.c_[centre+(points-centre)*bot_scale,np.full(n,z-thickness/2)]
    vertices=np.vstack((top,bottom))
    tris=[]
    for a,b,c in faces:
        tris.extend([[a,b,c],[n+c,n+b,n+a]])
    for i in range(n):
        j=(i+1)%n
        tris.extend([[i,n+i,j],[j,n+i,n+j]])
    result=trimesh.Trimesh(vertices=vertices,faces=np.array(tris),process=False)
    trimesh.repair.fix_normals(result)
    return result


def cross_loft(sections:list[tuple[float,float,float,float]], steps=8):
    # sections are x, half-width, half-height, z-centre; hardened octagonal hull with angled shoulders.
    points=[]
    for x,w,h,z in sections:
        ring=[(-w*.68,-h), (w*.68,-h), (w,-h*.38), (w,h*.38), (w*.68,h),(-w*.68,h),(-w,h*.38),(-w,-h*.38)]
        for y,zz in ring:points.append([x,y,zz+z])
    faces=[];N=8
    for k in range(len(sections)-1):
        for j in range(N):
            a=k*N+j;b=k*N+(j+1)%N;c=(k+1)*N+(j+1)%N;d=(k+1)*N+j
            faces.extend(([a,b,c],[a,c,d]))
    for i in range(1,N-1):faces.extend(([0,i+1,i],[(len(sections)-1)*N,(len(sections)-1)*N+i,(len(sections)-1)*N+i+1]))
    mesh=trimesh.Trimesh(vertices=np.asarray(points),faces=np.asarray(faces),process=False)
    trimesh.repair.fix_normals(mesh);return mesh


def beam(a,b, width,height=None):
    height=height or width
    a=np.array(a,float);b=np.array(b,float);d=b-a
    geom=trimesh.creation.box(extents=[np.linalg.norm(d),width,height]);transform=trimesh.geometry.align_vectors([1,0,0],d)
    if transform is None:transform=np.eye(4)
    transform[:3,3]=(a+b)/2;geom.apply_transform(transform)
    return geom


def bulb(x,y,z,rx,ry,rz, subdivisions=1):
    m=trimesh.creation.icosphere(subdivisions=subdivisions,radius=1)
    m.apply_scale([rx,ry,rz]);m.apply_translation([x,y,z]);return m


def claw(path:list[tuple[float,float,float]],radii:list[float],sides=6):
    # Multi-segment curved tapered biomechanical limb, not a generic cylinder.
    vertices=[]
    for i,p in enumerate(path):
        cur=np.asarray(p,float)
        tangent=np.asarray(path[min(i+1,len(path)-1)],float)-np.asarray(path[max(i-1,0)],float)
        tangent=tangent/(np.linalg.norm(tangent)+1e-8)
        norm=np.cross(tangent,[0,0,1]);norm/=np.linalg.norm(norm)+1e-8
        binorm=np.cross(tangent,norm)
        for k in range(sides):
            theta=math.tau*k/sides
            vertices.append(cur+radii[i]*(math.cos(theta)*norm+.62*math.sin(theta)*binorm))
    faces=[]
    for i in range(len(path)-1):
        for k in range(sides):
            j=(k+1)%sides;a=i*sides+k;b=i*sides+j;c=(i+1)*sides+j;d=(i+1)*sides+k
            faces.extend([[a,b,c],[a,c,d]])
    for i in range(1,sides-1):faces.extend([[0,i+1,i],[(len(path)-1)*sides,(len(path)-1)*sides+i,(len(path)-1)*sides+i+1]])
    m=trimesh.Trimesh(vertices=vertices,faces=np.asarray(faces),process=False)
    trimesh.repair.fix_normals(m);return m

class Builder:
    def __init__(self):self.solid=[];self.glows=[]
    def add(self,mesh,color,glow=False):
        mesh=mesh.copy();mesh.visual.vertex_colors=np.tile(np.array(color,dtype=np.uint8),(len(mesh.vertices),1))
        (self.glows if glow else self.solid).append(mesh)
    def poly(self,p,t,z,c,scale=1):
        self.add(from_poly([(x*scale,y*scale) for x,y in p],t,z),c)
    def line(self,a,b,w,h,c,glow=False):self.add(beam(a,b,w,h),c,glow)
    def hull(self,sections,color):self.add(cross_loft(sections),color)
    def pod(self,x,y,z,rx,ry,rz,c,glow=False):self.add(bulb(x,y,z,rx,ry,rz),c,glow)
    def prism_engine(self,x,y,z,r=.10,len=.13):
        self.add(beam((x-len/2,y,z),(x+len/2,y,z),r*1.8,r*1.5),BLUE_LIGHT,True)
    def panel_lines(self,section_coords,top=.15, color=SHADE, offset=.0):
        for x0,x1,y0,y1 in section_coords:self.line((x0,y0,top+offset),(x1,y1,top+offset),.015,.012,color)
    def export(self,name):
        scene=trimesh.Scene()
        if self.solid:
            mesh=trimesh.util.concatenate(self.solid)
            scene.add_geometry(mesh,geom_name='Hull and platework')
        if self.glows:
            mesh=trimesh.util.concatenate(self.glows)
            is_reaper=name.startswith('reaper-')
            mesh.visual=trimesh.visual.TextureVisuals(material=PBRMaterial(name='Red Reaper emitter' if is_reaper else 'Blue drive emitters',baseColorFactor=([1,.14,.20,1] if is_reaper else [.13,.65,1,1]),emissiveFactor=([1,.05,.08] if is_reaper else [.10,.6,1.0]),metallicFactor=0,roughnessFactor=.5))
            scene.add_geometry(mesh,geom_name='Engines and emitters')
        p=DEST/f'{name}.glb';p.write_bytes(scene.export(file_type='glb'))
        return p

def build_dreadnought(name,style='alliance',elongate=1.):
    b=Builder();p=lambda x:x*elongate
    is_c=style=='cerberus';base=CERBERUS_DARK if is_c else ALLIANCE;secondary=CERBERUS if is_c else ARMOUR;line=ORANGE if is_c else BLUE
    b.hull([(p(-1.55),.14,.15,0),(p(-1.1),.42,.27,0),(p(-.35),.35,.29,0),(p(.65),.22,.18,.01),(p(1.48),.09,.075,0),(p(1.9),.016,.028,0)],base)
    b.poly([(p(1.7),0),(p(.68),-.12),(p(-1.18),-.23),(p(-1.52),-.11),(p(-1.52),.11),(p(-1.18),.23),(p(.68),.12)],.09,.265,secondary)
    for s in [-1,1]:
        # Paired outer armoured fairings + two long drive booms at stern.
        b.poly([(p(1.04),s*.14),(p(.48),s*.42),(p(-.68),s*.51),(p(-1.61),s*.56),(p(-1.95),s*.44),(p(-1.6),s*.29),(p(-.56),s*.25)],.17,-.01,secondary)
        b.poly([(p(.79),s*.26),(p(.22),s*.38),(p(-1.49),s*.44),(p(-1.66),s*.38),(p(-.36),s*.30)],.052,.135,base)
        b.line((p(-1.72),s*.47,.02),(p(.55),s*.31,.16),.040,.018,line)
        for x in [-1.12,-.73,-.34,.08,.42]:
            b.line((p(x),s*.38,.17),(p(x+.08),s*.37,.17),.013,.009,SILVER)
        b.prism_engine(p(-1.98),s*.48,-.015,.095,.22)
        b.pod(p(-1.78),s*.45,.03,.23,.10,.09,DARK)
    b.line((p(-1.75),0,.30),(p(1.74),0,.125),.12,.046,DARK)
    b.line((p(.15),0,.318),(p(1.67),0,.08),.048,.025,line)
    for x in [-1.1,-.55,.15,.60]:
        b.line((p(x),-.10,.31),(p(x),.10,.31),.025,.013,SHADE)
    # side gun housings and dorsal bridge
    b.pod(p(-.3),0,.30,.33,.15,.08,SILVER)
    b.line((p(1.18),0,-.15),(p(1.92),0,-.015),.070,.055,DARK)
    return b.export(name)

def build_cruiser(name,style='alliance',frigate=False):
    b=Builder();is_c=style=='cerberus';base=CERBERUS_DARK if is_c else ALLIANCE;secondary=CERBERUS if is_c else ARMOUR;col=ORANGE if is_c else BLUE
    w=.76 if frigate else 1.0
    def a(v):return v*w
    b.hull([(a(-1.55),.12*w,.12,0),(a(-1.1),.29*w,.19,0),(a(-.4),.30*w,.24,0),(a(.65),.18*w,.12,0),(a(1.62),.035,.044,0)],base)
    b.poly([(a(1.68),0),(a(.8),-.13*w),(a(-.37),-.22*w),(a(-1.35),-.18*w),(a(-1.42),.18*w),(a(-.37),.22*w),(a(.8),.13*w)],.07,.19,secondary)
    for s in (-1,1):
        b.poly([(a(.65),s*.15*w),(a(-.08),s*.43*w),(a(-1.50),s*.51*w),(a(-1.58),s*.29*w),(a(-.46),s*.16*w)],.15,-.02,base)
        b.line((a(-1.33),s*.41*w,.065),(a(.42),s*.27*w,.15),.038,.015,col)
        b.prism_engine(a(-1.59),s*.43*w,0,.09*w,.17)
    b.line((a(-1.48),0,.23),(a(1.55),0,.055),.048,.023,DARK)
    if not frigate:
        for x in (-.9,-.3,.25):b.line((a(x),-.10,.255),(a(x),.10,.255),.02,.009,SILVER)
    return b.export(name)

def build_normandy(name='normandy',valkyrie=False):
    b=Builder();scale=1.13 if valkyrie else 1
    x=lambda v:v*scale
    base=ALLIANCE;wing=SILVER;paint=RED
    b.hull([(x(-1.45),.16,.15,0),(x(-.8),.32,.24,0),(x(-.1),.28,.23,0),(x(.72),.16,.14,0),(x(1.82),.02,.032,0)],base)
    # Wide swept Normandy split-wings; rear tip engine pods are detached by thin root structures.
    for s in [-1,1]:
        b.poly([(x(.48),s*.15),(x(.05),s*.37),(x(-1.04),s*1.12),(x(-1.48),s*1.03),(x(-1.24),s*.67),(x(-.54),s*.21)],.095,.03,wing)
        b.poly([(x(.28),s*.22),(x(-.27),s*.54),(x(-1.21),s*.92),(x(-1.36),s*.90),(x(-.55),s*.44)],.030,.098,ARMOUR)
        b.line((x(-1.21),s*.9,.12),(x(-.30),s*.50,.15),.048,.016,paint)
        b.line((x(-.91),s*.77,-.03),(x(-.33),s*.44,-.03),.025,.018,DARK)
        b.pod(x(-1.24),s*.94,-.06,.40,.17,.14,ARMOUR)
        b.prism_engine(x(-1.59),s*.95,-.065,.13,.25)
        b.line((x(-1.52),s*.95,.05),(x(-.90),s*.95,.05),.028,.015,SILVER)
    b.poly([(x(1.75),0),(x(.9),-.11),(x(-.65),-.17),(x(-1.32),-.1),(x(-1.32),.1),(x(-.65),.17),(x(.9),.11)],.085,.27,WHITE)
    b.line((x(-1.36),0,.28),(x(1.56),0,.13),.050,.036,ARMOUR)
    b.pod(x(.55),0,.30,.44,.11,.06,DARK)
    # Four quiet hull stripes; N7 red detail represented with a restrained dorsal bar.
    for s in [-1,1]:b.line((x(-.67),s*.14,.32),(x(.37),s*.105,.28),.037,.012,paint)
    if valkyrie:
        # Dedicated, extra-long NOVA spinal installation and exposed muzzle rings.
        b.line((x(-1.4),0,.39),(x(2.32),0,.13),.15,.095,DARK)
        b.line((x(.58),0,.47),(x(2.32),0,.17),.061,.049,BLUE)
        b.pod(x(2.32),0,.15,.065,.095,.083,BLUE_LIGHT,True)
        for t in (1.26,1.55,1.83):b.line((x(t),-.09,.21),(x(t),.09,.21),.036,.021,SILVER)
        b.pod(x(-.72),0,.36,.42,.21,.11,ARMOUR)
    return b.export(name)

def build_reaper(name,kind='capital'):
    b=Builder();big=1.13 if kind=='harbinger' else .79 if kind=='destroyer' else .52 if kind=='oculus' else 1
    p=lambda v:v*big
    r=REAPER_DARK;m=REAPER;hi=REAPER_MID
    b.hull([(p(-1.60),p(.05),p(.08),0),(p(-1.14),p(.30),p(.20),0),(p(-.44),p(.56),p(.34),0),(p(.46),p(.45),p(.36),0),(p(1.20),p(.20),p(.18),0),(p(2.16),p(.022),p(.032),0)],m)
    b.poly([(p(2.20),0),(p(1.22),p(-.20)),(p(.36),p(-.41)),(p(-.48),p(-.45)),(p(-1.39),p(-.20)),(p(-1.56),0),(p(-1.39),p(.20)),(p(-.48),p(.45)),(p(.36),p(.41)),(p(1.22),p(.20))],p(.12),p(.26),hi)
    b.poly([(p(2.23),0),(p(1.35),p(-.07)),(p(.15),p(-.12)),(p(-1.37),p(-.13)),(p(-1.49),0),(p(-1.37),p(.13)),(p(.15),p(.12)),(p(1.35),p(.07))],p(.14),p(.41),REAPER_DARK)
    # Layered overlapping armour segments follow the anatomical shape.
    for x,w in [(-.98,.26),(-.62,.37),(-.20,.45),(.28,.35),(.72,.28),(1.12,.18)]:
        b.line((p(x),p(-w),p(.35)),(p(x+.13),p(w),p(.35)),p(.055),p(.040),r)
    for s in [-1,1]:
        outer=[(p(-.52),p(s*.38),p(.07)),(p(-.06),p(s*.66),p(-.025)),(p(.65),p(s*1.03),p(-.08)),(p(1.25),p(s*1.19),p(-.03)),(p(1.56),p(s*1.13),p(.01))]
        inner=[(p(.18),p(s*.30),p(.13)),(p(.61),p(s*.48),p(.02)),(p(1.16),p(s*.75),p(-.05)),(p(1.87),p(s*.73),p(.02))]
        back=[(p(-1.11),p(s*.20),p(-.08)),(p(-1.60),p(s*.47),p(-.10)),(p(-1.95),p(s*.59),p(-.05))]
        b.add(claw(outer,[p(.19),p(.19),p(.13),p(.09),p(.012)]),m)
        b.add(claw(inner,[p(.115),p(.13),p(.08),p(.012)]),hi)
        b.add(claw(back,[p(.15),p(.10),p(.015)]),r)
        for x,y,z in outer[1:-1]:b.pod(x,y,z,p(.10),p(.065),p(.045),r)
        b.line((p(-.64),p(s*.30),p(.24)),(p(.52),p(s*.39),p(.14)),p(.04),p(.018),r)
    # Reaper central eye / weapon opening faces forward between the claws.
    b.pod(p(1.32),0,p(-.025),p(.11),p(.17),p(.075),r)
    b.pod(p(1.38),0,p(-.025),p(.065),p(.105),p(.055),RED_LIGHT,True)
    for s in [-1,1]:
        b.line((p(-.72),p(s*.20),p(.39)),(p(.82),p(s*.17),p(.34)),p(.021),p(.015),REAPER_HIGHLIGHT)
    if kind=='harbinger':
        for s in (-1,1):
            b.add(claw([(p(-.3),p(s*.52),p(.05)),(p(.18),p(s*.95),p(-.09)),(p(.78),p(s*1.42),p(-.11)),(p(1.33),p(s*1.55),p(-.04))],[p(.15),p(.12),p(.08),p(.016)]),REAPER_DARK)
        b.pod(p(.18),0,p(.43),p(.37),p(.33),p(.14),hi)
    if kind=='oculus':
        b.pod(p(.60),0,p(.4),p(.22),p(.19),p(.12),r)
    return b.export(name)


def main():
    files={
       'kilimanjaro':build_dreadnought('alliance-kilimanjaro'),
       'everest':build_dreadnought('alliance-everest',elongate=.95),
       'alliance-cruiser':build_cruiser('alliance-cruiser'),
       'alliance-frigate':build_cruiser('alliance-frigate',frigate=True),
       'normandy':build_normandy('normandy-sr2'),
       'valkyrie':build_normandy('normandy-valkyrie',valkyrie=True),
       'black-dread':build_dreadnought('cerberus-black-dread',style='cerberus'),
       'black-cruiser':build_cruiser('cerberus-heavy-cruiser',style='cerberus'),
       'black-frigate':build_cruiser('cerberus-frigate',style='cerberus',frigate=True),
       'sovereign':build_reaper('reaper-sovereign'),
       'harbinger':build_reaper('reaper-harbinger','harbinger'),
       'reaper-destroyer':build_reaper('reaper-destroyer','destroyer'),
       'oculus':build_reaper('reaper-oculus','oculus')
    }
    manifest={k:v.name for k,v in files.items()}
    (DEST/'models.json').write_text(json.dumps(manifest,indent=2)+'\n')
    for k,v in files.items():
        loaded=trimesh.load(v,force='scene');bounds=loaded.bounds
        print(f'{k:20} {v.stat().st_size/1024:7.1f} kB  {bounds.round(2).tolist()}')

if __name__=='__main__':main()
