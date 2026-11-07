import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const host = 'http://127.0.0.1:5173';
const sizes = (process.env.RW_COUNTS ?? '1000,3000,5000')
  .split(',').map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 50000);
const warmup = Math.max(2000, Number(process.env.RW_WARMUP_MS ?? 8000));
const sample = Math.max(3000, Number(process.env.RW_SAMPLE_MS ?? 10000));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let server;

try {
  try {
    const response=await fetch(host,{signal:AbortSignal.timeout(1500)});
    if(!response.ok)throw new Error('Not running');
    console.log('Using existing Vite development server.');
  } catch {
    server=spawn(process.platform==='win32'?'npm.cmd':'npm',
      ['run','dev','--','--host','127.0.0.1'],{
        cwd:process.cwd(),shell:process.platform==='win32',stdio:'ignore'
      });
    let ready=false;
    for(let n=0;n<80;n++){
      await sleep(500);
      try{const response=await fetch(host,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}
    }
    if(!ready)throw new Error('Could not start Vite on localhost:5173');
  }
  await mkdir('benchmark-results',{recursive:true});
  let browser;
  try {
    browser=await chromium.launch({channel:'msedge',headless:false,args:['--enable-gpu-rasterization','--enable-zero-copy','--ignore-gpu-blocklist']});
  } catch {
    browser=await chromium.launch({headless:false,args:['--enable-gpu-rasterization','--enable-zero-copy']});
  }
  const data=[];
  try{
    const page=await browser.newPage({viewport:{width:3840,height:2160},deviceScaleFactor:1});
    page.setDefaultTimeout(120000);
    for(const count of sizes)for(const preset of ['high','ultra']){
      // The simulator intentionally protects casual sessions from >12k live ships.
      // The explicit benchmark flag bypasses the estimator only for this run.
      const url=host+'/?ships='+count+(count>12000?'&forceLive=1':'')+'&profile=1';
      let record={ships:count,preset,viewport:'3840x2160',seed:42};
      try{
        await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
        await page.locator('#graphics').selectOption(preset);
        await page.waitForFunction(()=>typeof window.__reaperDiagnostics==='function',{timeout:120000});
        await sleep(warmup);
        const before=await page.evaluate(()=>window.__reaperDiagnostics(true));
        await sleep(sample);
        const after=await page.evaluate(()=>window.__reaperDiagnostics(true));
        record={
          ...record,
          actualShipCount:after.shipCount,
          simulationSecondsAdvanced:Number((after.time-before.time).toFixed(2)),
          elapsedWallSeconds:sample/1000,
          fps:after.fps,
          approximate1PctLowFps:Number((1000/Math.max(0.01,after.frameMsP99)).toFixed(1)),
          simTicksPerSecond:Number(((after.tick-before.tick)/(sample/1000)).toFixed(2)),
          simulationPhasesMeanMs:Object.fromEntries(Object.keys(after.simulationProfile??{})
            .filter(k=>k.endsWith('Ms'))
            .map(k=>[k,Number(((after.simulationProfile[k]-before.simulationProfile[k])/
              Math.max(1,after.simulationProfile.ticks-before.simulationProfile.ticks)).toFixed(3))])),
          weaponEventsDuringSample:after.weaponFiredTotal-before.weaponFiredTotal,
          destructionEventsDuringSample:after.destroyedTotal-before.destroyedTotal,
          projectilesActive:after.projectileCount,
          missilesActive:after.missileCount,
          jsHeapMb:after.jsHeapMb,
          meanFrameMs:Number(after.frameMsAverage.toFixed(2)),
          p95FrameMs:Number(after.frameMsP95.toFixed(2)),
          p99FrameMs:Number(after.frameMsP99.toFixed(2)),
          drawCalls:after.view?.drawCalls??null,
          triangles:after.view?.triangles??null,
          rendererCpuMs:after.view?.renderCpuMs??null,
          simCpuPerRafMs:after.simCpuMs,
          gpuFrameMs:after.view?.gpuFrameMs??null,
          status:'ok',
          activeCombat:after.weaponFiredTotal>before.weaponFiredTotal,
          simulationAdvanced:after.tick>before.tick
        };
        await page.locator('#scene3d').screenshot({
          path:path.join('benchmark-results',count+'-'+preset+'.png'),timeout:120000
        });
      }catch(error){
        record={...record,status:'error',message:String(error)};
      }
      data.push(record);
      console.log(JSON.stringify(record));
      await writeFile('benchmark-results/results.json',JSON.stringify({
        note:'Actual browser results on the machine running this script; WebGL GPU timer may be unavailable.',
        samples:data
      },null,2));
    }
  }finally{await browser.close();}
}finally{
  if(server)server.kill();
}
