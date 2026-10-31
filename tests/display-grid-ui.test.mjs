import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../dist/viewer-layout.css',import.meta.url),'utf8');

test('shared display extent drives slice navigation and image planes without changing export grid',()=>{
  assert.match(app,/displayExtent\(state\.a,state\.b,state\.params,state\.plane\)/);
  assert.match(app,/displayPlane\(v,state\.plane,state\.slice,extent\)/);
  assert.match(app,/sliceSlider'\)\.min=extent\.min/);
  assert.match(app,/p\.every\(\(v,i\)=>v>=0&&v<state\.a\.dims\[i\]\)/);
  assert.match(app,/sample\(state\.b,\.\.\.mapped\(map,\.\.\.p\)\)/);
  assert.match(app,/\[nx,ny,nz\]=a\.dims/);
});

test('resetting registration refreshes the display range and clipping warnings',()=>{
  const reset=app.match(/function resetRegistration[\s\S]*?function updateWarnings/)?.[0]||'';
  assert.match(reset,/configureSlice\(\);updateWarnings\(\);scheduleResampling\(\)/);
});
test('series title sits left and muted date right in both image corners',()=>{
  for(const slot of ['A','B']){
    assert.match(html,new RegExp(`id="name${slot}"[^>]*></div>[\\s\\S]*id="date${slot}"`));
  }
  assert.match(app,/name\.textContent=volume\.synthetic\?'':volume\.name/);
  assert.match(app,/date\.textContent=volume\.synthetic\?'':formatSeriesDate\(volume,language\)/);
  assert.match(css,/\.series-name\{[^}]*left:10px/);
  assert.match(css,/\.series-date\{[^}]*right:10px/);
  assert.match(css,/\.series-date\{[^}]*color:#98a9ab/);
});
