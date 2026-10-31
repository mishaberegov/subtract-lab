import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');

test('manual alignment uses corner handles without one-degree buttons or numeric pose fields',()=>{
  assert.match(html,/id="manualMode"[^>]*type="checkbox"/);
  assert.doesNotMatch(html,/id="rotateLeft"|id="rotateRight"|class="manual-rotate"/);
  assert.doesNotMatch(app,/\$\('rotateLeft'\)|\$\('rotateRight'\)/);
  assert.match(html,/data-rotate-handle="tl"/);
  assert.match(html,/id="resetTransform"/);
  assert.doesNotMatch(html,/id="p[0-5]"/);
  assert.match(html,/Перетащи B поверх A/);
  assert.match(app,/if\(\$\('manualMode'\)\.checked\)document\.querySelector\('\[data-display="difference"\]'\)\.click\(\)/);
});
test('manual controls sit beside the result image instead of below the workspace',()=>{
  const panel=html.match(/<section class="viewport result-viewport"([\s\S]*?)<\/section>/)?.[1];
  assert.ok(panel);
  assert.ok(panel.indexOf('id="manualMode"')<panel.indexOf('id="canvasR"'));
  assert.doesNotMatch(html.match(/<aside class="sidebar">([\s\S]*?)<\/aside>/)?.[1]||'',/id="manualMode"/);
});
test('drag renders the current difference from B directly, then resamples on release',()=>{
  assert.match(app,/state\.manualDragging\?sample\(state\.b,\.\.\.mapped\(map,\.\.\.p\)\)/);
  assert.match(app,/if\(drag\.rotation\)[^\n]*requestRender\(\)/);
  assert.match(app,/dragTranslation\(/);
  assert.match(app,/pointerup[^\n]*scheduleResampling\(/);
  assert.doesNotMatch(app,/ctx\.drawImage\(offscreen\.fusion,/);
});
test('manual editing switches to difference and leaving it exits editing',()=>{
  assert.match(app,/if\(\$\('manualMode'\)\.checked\)document\.querySelector\('\[data-display="difference"\]'\)\.click\(\)/);
  assert.match(app,/state\.display!=='difference'&&\$\('manualMode'\)\.checked\)cancelManualMode\(\)/);
});
test('manual editing keeps A fixed across drags until editing exits',()=>{
  assert.match(app,/function viewExtent\(\)\{if\(\$\('manualMode'\)\.checked&&manualExtent\)return manualExtent;/);
  assert.match(app,/manualExtent=viewExtent\(\);\s*stopResampling\(\);state\.manualDragging=true/);
  assert.doesNotMatch(app,/pointerup[^\n]*manualExtent=null/);
  assert.doesNotMatch(app,/pointercancel[^\n]*manualExtent=null/);
  assert.match(app,/function cancelManualMode\(\)\{state\.manualDragging=false;manualExtent=null;/);
});
test('reset and clear exit manual mode, automatic registration and transform export remain wired',()=>{
  assert.match(app,/function resetRegistration\([^)]*\)[\s\S]*?cancelManualMode\(\)/);
  assert.match(app,/function clearAll\(announce=true\)[\s\S]*?cancelManualMode\(\)/);
  assert.match(app,/worker\.postMessage\(\{a:state\.a,b:state\.b,method:/);
  assert.match(app,/matrixAtoB4x4:/);
});
