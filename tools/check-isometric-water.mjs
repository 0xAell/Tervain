/** Run against a served checkout or an offline HTML file. Uses the game's own Chrome driver. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openPage } from './cdp.mjs';

const arg = process.argv[2] ?? 'http://127.0.0.1:5173/';
const url = /^(?:https?|file):/.test(arg) ? arg : pathToFileURL(path.resolve(arg)).href;
const canvasOnly = process.argv.includes('--canvas'),
  flags = canvasOnly ? ['--disable-webgl'] : [];
const page = await openPage(url, { w: 1000, h: 680, flags });
const run = (code) => page.eval('const c=window.tervain,v=c.valley,s=c.scene,g=s.ground;' + code);
try {
  for (let i = 0; i < 150 && !(await page.eval('return !!window.tervain')); i++) await page.wait(100);
  const button = await page.eval(
    'const r=document.querySelector(".title-screen button.primary").getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];'
  );
  await page.click(...button);
  await run('c.page("pause");return true;');
  const renderer = await run('return g.accelerated?"WebGL2":"Canvas";');
  assert.equal(renderer, canvasOnly ? 'Canvas' : 'WebGL2');
  const checks = [];
  for (const [name, x, z] of [
    ['wreck', -279, 3],
    ['sea', -294, 12],
    ['village', -13, 0],
    ['bridge', 34, -3],
    ['spring', -10.5, -93.2],
  ]) {
    const data = await run(`c.game.setPlayerTransform(${x},0,${z},0);s.resetCamera();v.time=3.6;s.render(v,0);
      const ctx=s.context,W=ctx.canvas.width,H=ctx.canvas.height;
      const buf=document.createElement('canvas');buf.width=W;buf.height=H;const m=buf.getContext('2d');
      const read=ctx=>ctx.getImageData(0,0,W,H).data, mask=()=>{m.clearRect(0,0,W,H);g.drawMask(m);return read(m);};
      const before=read(ctx),wet0=mask(),draw=s.water.draw;
      try{s.water.draw=()=>{};s.render(v,0);}finally{s.water.draw=draw;}
      const plain=read(ctx);v.time+=.47;s.render(v,0);const next=read(ctx),wet1=mask();
      let cast=0,spill=0,moving=0,bank=0;
      const diff=(a,b,k)=>a[k]!==b[k]||a[k+1]!==b[k+1]||a[k+2]!==b[k+2];
      for(let k=0;k<before.length;k+=4){
        if(diff(before,plain,k)){if(wet0[k+3])cast++;else spill++;}
        if(wet0[k+3]!==wet1[k+3])bank++;
        if(wet0[k+3]&&wet1[k+3]&&diff(before,next,k))moving++;
      }
      return {cast,spill,moving,bank};`);
    assert(
      data.cast > 8 && data.spill === 0 && data.moving > 100 && data.bank > 0,
      name + ' ' + JSON.stringify(data)
    );
    checks.push({ name, ...data });
  }
  const levels =
    await run(`c.game.setPlayerTransform(-13,0,4,0);s.resetCamera();c.game.state.quest.phase='committed';
    const measure=allocation=>{c.game.state.quest.allocation=allocation;v.time+=.08;s.render(v,0);
      const canvas=document.createElement('canvas');canvas.width=s.context.canvas.width;canvas.height=s.context.canvas.height;
      const m=canvas.getContext('2d');g.drawMask(m);const a=m.getImageData(0,0,canvas.width,canvas.height).data;
      let n=0;for(let k=3;k<a.length;k+=4)if(a[k])n++;return n;};
    return [measure('rillford'),measure('quarry')];`);
  assert(levels[0] > levels[1] + 20, 'Allocation must change the village channel cross-section');
  const seams = await run(`const flow={main:.5,village:.3,quarry:.3,spring:.4};
    const paint=(ox,oy)=>{const canvas=document.createElement('canvas');canvas.width=256;canvas.height=160;
      const ctx=canvas.getContext('2d');g.draw(ctx,ox,oy,256,160,4,flow,8);return ctx.getImageData(0,0,256,160).data;};
    const a=paint(1930,880),b=paint(1943,887);let errors=0;
    for(let y=0;y<153;y++)for(let x=0;x<243;x++){const i=(y*256+x)*4,j=((y+7)*256+x+13)*4;
      if(a[i]!==b[j]||a[i+1]!==b[j+1]||a[i+2]!==b[j+2])errors++;}
    return errors;`);
  assert.equal(seams, 0, 'Translating the camera must translate the same world pixels');
  const errors = page.console().filter((s) => s.startsWith('[error]') || s.startsWith('[exception]'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ renderer, checks, villageChannelCoveredPixels: levels, cameraSeams: seams }));
} finally {
  await page.close();
}
