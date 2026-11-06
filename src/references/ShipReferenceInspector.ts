import * as THREE from 'three';
import { getShipTemplate } from '@/rendering/ships';
import { auditShipReferences, ShipReferenceRegistry, type ShipReferenceMatch } from './ShipReferenceRegistry';
import visualReferences from './visual_references.json';

const views=[
  {name:'TOP',pos:[0,1,0],up:[0,0,1]},
  {name:'BOTTOM',pos:[0,-1,0],up:[0,0,-1]},
  {name:'PORT',pos:[-1,0,0],up:[0,1,0]},
  {name:'STARBOARD',pos:[1,0,0],up:[0,1,0]},
  {name:'BOW',pos:[0,0,1],up:[0,1,0]},
  {name:'STERN',pos:[0,0,-1],up:[0,1,0]},
] as const;
const css=`
.shipref-open{position:fixed;right:16px;bottom:16px;z-index:9998;cursor:pointer;
  font:600 12px ui-monospace,monospace;padding:10px 14px;color:#d8ebfb;
  background:#10283b;border:1px solid #6a9ebf}
.shipref-panel{position:fixed;inset:5vh 4vw;z-index:9999;display:flex;flex-direction:column;
  overflow:hidden;background:#07121e;color:#d8ebfa;border:1px solid #6187a9;
  box-shadow:0 20px 80px #000e;font:12px system-ui,sans-serif}
.shipref-panel *{box-sizing:border-box}
.shipref-top{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 16px;border-bottom:1px solid #29465f;background:#102338}
.shipref-top h2{font-size:17px;margin:0 auto 0 0}
.shipref-top select,.shipref-top button{background:#162d43;color:#e1f1fb;border:1px solid #53718d;padding:7px}
.shipref-top input{accent-color:#89bce7}
.shipref-main{overflow:auto;padding:14px;flex:1}
.shipref-context{display:flex;justify-content:space-between;gap:15px;margin-bottom:12px;flex-wrap:wrap}
.shipref-context span{color:#b5ccde}
.shipref-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.shipref-cell{border:1px solid #28445d;background:#030a12;min-width:0}
.shipref-cell header{display:flex;justify-content:space-between;padding:8px 10px;background:#152738}
.shipref-stage{position:relative;aspect-ratio:1.48;background:#020712;overflow:hidden}
.shipref-stage canvas,.shipref-stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.shipref-stage img{pointer-events:none}
.shipref-cell footer{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:6px}
.shipref-cell input[type=file]{width:100%;max-width:170px;font-size:9px}
.shipref-cell button{background:#193b51;border:1px solid #526d85;color:#eee;font-size:10px;padding:4px 7px;cursor:pointer}
.shipref-cell button:disabled{opacity:.42;cursor:not-allowed}
.shipref-note{width:100%;min-height:30px;background:#091c2d;color:#dceaff;border:1px solid #3c5870;resize:vertical}
.shipref-unverified{color:#f7c68f}
.shipref-pass{color:#78e3b4}
@media(max-width:900px){.shipref-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.shipref-grid{grid-template-columns:1fr}.shipref-panel{inset:2vh 2vw}}
`;

function button(label:string,onClick:()=>void):HTMLButtonElement{
  const b=document.createElement('button');b.textContent=label;b.addEventListener('click',onClick);return b;
}
function make(tag:string,cls?:string):HTMLElement{
  const el=document.createElement(tag);if(cls)el.className=cls;return el;
}
function text(parent:HTMLElement,value:string):void{parent.append(document.createTextNode(value));}
const records=auditShipReferences();
const key=(id:string,view:string)=>'reaper-ref-pack-v1:'+id+':'+view;

export function installShipReferenceInspector():void{
  if(document.getElementById('ship-reference-launch'))return;
  const style=document.createElement('style');style.textContent=css;document.head.append(style);
  const open=button('SHIP REFERENCES · 6 VIEWS',()=>showInspector());
  open.id='ship-reference-launch';open.className='shipref-open';document.body.append(open);
}

/** In-engine orthographic geometry review. The uploaded reference images are
 * local-only object URLs; no unlicensed artwork is bundled or transmitted.
 */
function showInspector():void{
  const old=document.getElementById('ship-reference-panel');if(old){old.remove();return;}
  const panel=make('section','shipref-panel');panel.id='ship-reference-panel';
  panel.setAttribute('aria-label','Ship silhouette verification');
  const top=make('header','shipref-top'),title=make('h2');
  title.textContent='SHIP REFERENCE REGISTRY · SIX-VIEW QA';top.append(title);
  const select=document.createElement('select');
  for(const match of records){
    const option=document.createElement('option');
    option.value=match.reference.id;
    option.textContent=match.reference.id+' — '+match.reference.name+(match.modelAvailable?'':' · MISSING');
    select.append(option);
  }
  top.append(select);
  const opacityLabel=make('label');text(opacityLabel,'REFERENCE OPACITY ');
  const alpha=document.createElement('input');alpha.type='range';alpha.min='0';alpha.max='100';alpha.value='50';
  opacityLabel.append(alpha);top.append(opacityLabel);
  const exportReport=button('EXPORT QA JSON',()=>{
    const reviewed=records.map(match=>({
      referenceId:match.reference.id,name:match.reference.name,
      geometryStatus:match.reference.geometry_status,sourceVisibility:match.reference.source_visibility,
      classId:match.classId,modelAvailable:match.modelAvailable,actualGameMesh:false,
      views:Object.fromEntries(views.map(v=>[v.name,{
        approval:sessionStorage.getItem(key(match.reference.id,v.name))??'NOT VERIFIED',
        notes:sessionStorage.getItem(key(match.reference.id,v.name)+':note')??''
      }]))
    }));
    const blob=new Blob([JSON.stringify({source:'user-reference-pack-v1',reviewed},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');
    link.href=url;link.download='reaper-war-ship-reference-audit.json';document.body.append(link);link.click();
    link.remove();URL.revokeObjectURL(url);
  });
  top.append(exportReport);
  const close=button('CLOSE',()=>{release();panel.remove();});top.append(close);
  panel.append(top);
  const main=make('main','shipref-main'),context=make('div','shipref-context'),grid=make('div','shipref-grid');
  main.append(context,grid);panel.append(main);document.body.append(panel);
  const urls:string[]=[];
  const disposers:Array<()=>void>=[];
  function release():void{for(const url of urls)URL.revokeObjectURL(url);urls.length=0;for(const cb of disposers)cb();disposers.length=0;}
  function render():void{
    release();grid.replaceChildren();context.replaceChildren();
    const match=records.find(r=>r.reference.id===select.value) as ShipReferenceMatch;
    const ref=match.reference;
    const info=make('div');
    info.textContent=ref.name+' · '+ref.geometry_status+' · '+ref.build_priority+
      ' · DATUM '+(ref.length_m===null?'NOT ESTABLISHED':ref.length_m+' m')+
      ' · '+(ref.apex_original?'APEX ORIGINAL':'NON-APEX REFERENCE');
    context.append(info);
    const provenance=make('span');
    provenance.textContent='Sources: '+ref.primary_source_ids.join(', ')+
      ' · MESH: '+(match.modelAvailable?'PROCEDURAL / NOT VERIFIED':'NO MATCHED MESH');
    context.append(provenance);
    const supported=visualReferences.filter(entry=>entry.ship===ref.id);
    if(supported.length){
      const references=make('div');references.style.width='100%';
      text(references,'REFERENCE LINKS · ');
      for(const item of supported){
        const link=document.createElement('a');
        link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';
        link.textContent=item.id+' ('+item.type+')';
        link.style.cssText='margin-right:14px;color:#94c8f4;text-decoration:underline';
        references.append(link);
      }
      context.append(references);
    }
    if(!match.modelAvailable){
      const missing=make('p','shipref-unverified');
      missing.textContent='Dedicated reference model missing. No substitute has been invented.';
      grid.append(missing);return;
    }
    const template=getShipTemplate(match.classId!);
    const original=template.group;
    const bounds=new THREE.Box3().setFromObject(original);
    const center=bounds.getCenter(new THREE.Vector3());
    const size=bounds.getSize(new THREE.Vector3());
    const extent=Math.max(size.x,size.y,size.z,1);
    // A single temporary WebGL renderer produces all six static orthographic
    // shots. No six-context GPU allocation and no idle render loop.
    const scratch=document.createElement('canvas');
    scratch.width=768;scratch.height=520;
    const renderer=new THREE.WebGLRenderer({canvas:scratch,alpha:false,antialias:true});
    renderer.setSize(768,520,false);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.setClearColor(0x050b13);
    const scene=new THREE.Scene();
    const clone=original.clone(true);
    scene.add(clone);
    scene.add(new THREE.AmbientLight(0xb9cde3,1.2));
    const directional=new THREE.DirectionalLight(0xffffff,2);
    directional.position.set(extent,extent,extent);scene.add(directional);
    for(const v of views){
      const cell=make('article','shipref-cell'),head=make('header');
      const heading=make('strong');heading.textContent=v.name;
      const status=make('span','shipref-unverified');status.textContent='NOT VERIFIED';
      head.append(heading,status);cell.append(head);
      const stage=make('div','shipref-stage');
      const canvas=document.createElement('canvas');canvas.width=768;canvas.height=520;
      const img=document.createElement('img');img.alt=v.name+' user-supplied reference';img.hidden=true;
      stage.append(canvas,img);cell.append(stage);
      const foot=make('footer');
      const file=document.createElement('input');file.type='file';file.accept='image/*';
      file.setAttribute('aria-label',v.name+' comparison screenshot');
      file.addEventListener('change',()=>{
        const f=file.files?.[0];if(!f)return;
        const url=URL.createObjectURL(f);urls.push(url);img.src=url;img.hidden=false;
        const approve=foot.querySelector<HTMLButtonElement>('[data-qa-pass]');if(approve)approve.disabled=false;
      });
      foot.append(file);
      const pass=button('PASS',()=>{if(img.hidden)return;status.textContent='PASS · LOCAL REVIEW';status.className='shipref-pass';sessionStorage.setItem(key(ref.id,v.name),'pass');});
      pass.dataset.qaPass='yes';pass.disabled=true;pass.title='Upload a reference screenshot before marking PASS';
      const fail=button('FAIL',()=>{status.textContent='FAIL · LOCAL REVIEW';status.className='shipref-unverified';sessionStorage.setItem(key(ref.id,v.name),'fail');});
      foot.append(pass,fail);cell.append(foot);
      const note=document.createElement('textarea');note.className='shipref-note';
      note.placeholder='Source scene, lens and silhouette notes…';note.value=sessionStorage.getItem(key(ref.id,v.name)+':note')??'';
      note.addEventListener('input',()=>sessionStorage.setItem(key(ref.id,v.name)+':note',note.value));
      cell.append(note);
      grid.append(cell);
      const prior=sessionStorage.getItem(key(ref.id,v.name));
      if(prior){status.textContent=prior.toUpperCase()+' · LOCAL REVIEW';status.className=prior==='pass'?'shipref-pass':'shipref-unverified';}
      const camera=new THREE.OrthographicCamera(-extent*.95,extent*.95,extent*.64,-extent*.64,.001,extent*10);
      camera.position.copy(new THREE.Vector3(v.pos[0],v.pos[1],v.pos[2])).multiplyScalar(extent*2).add(center);
      camera.up.set(v.up[0],v.up[1],v.up[2]);camera.lookAt(center);
      camera.updateProjectionMatrix();renderer.render(scene,camera);
      canvas.getContext('2d')?.drawImage(scratch,0,0);
    }
    scene.remove(clone);renderer.dispose();renderer.forceContextLoss();
    const applyAlpha=()=>grid.querySelectorAll<HTMLImageElement>('.shipref-stage img').forEach(image=>image.style.opacity=String(Number(alpha.value)/100));
    alpha.oninput=applyAlpha;applyAlpha();
  }
  select.addEventListener('change',render);
  render();
}
