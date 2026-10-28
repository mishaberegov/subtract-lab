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
  assert.match(app,/if\(\$\('manualMode'\)\.checked\)document\.querySelector\('\[data-display="blend"\]'\)\.click\(\)/);
});
test('manual controls sit beside the result image instead of below the workspace',()=>{
  const panel=html.match(/<section class="viewport result-viewport"([\s\S]*?)<\/section>/)?.[1];
  assert.ok(panel);
  assert.ok(panel.indexOf('id="manualMode"')<panel.indexOf('id="canvasR"'));
  assert.doesNotMatch(html.match(/<aside class="sidebar">([\s\S]*?)<\/aside>/)?.[1]||'',/id="manualMode"/);
});
test('drag previews the cached aligned B with a canvas shift, then resamples on release',()=>{
  assert.match(app,/function renderManualPreview\(/);
  assert.match(app,/ctx\.drawImage\(offscreen\.fusion,/);
  assert.match(app,/dragTranslation\(/);
  assert.match(app,/pointerup[^\n]*scheduleResampling\(/);
});
test('manual editing switches to overlay and leaving overlay exits editing',()=>{
  assert.match(app,/if\(\$\('manualMode'\)\.checked\)document\.querySelector\('\[data-display="blend"\]'\)\.click\(\)/);
  assert.match(app,/state\.display!=='blend'&&\$\('manualMode'\)\.checked\)cancelManualMode\(\)/);
});
test('reset and clear exit manual mode, automatic registration and transform export remain wired',()=>{
  assert.match(app,/function resetRegistration\([^)]*\)[\s\S]*?cancelManualMode\(\)/);
  assert.match(app,/function clearAll\(announce=true\)[\s\S]*?cancelManualMode\(\)/);
  assert.match(app,/worker\.postMessage\(\{a:state\.a,b:state\.b,method:/);
  assert.match(app,/matrixAtoB4x4:/);
});
