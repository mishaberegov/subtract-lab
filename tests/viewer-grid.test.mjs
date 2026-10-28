import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../dist/viewer-layout.css',import.meta.url),'utf8');

test('A and B no longer show redundant series summary rows',()=>{
  assert.doesNotMatch(html,/class="series-summary"/);
  assert.doesNotMatch(app,/\$\('(?:name|meta)[AB]'\)/);
  assert.doesNotMatch(app,/\$\('(?:name|meta)'\+up\)/);
  assert.match(html,/id="demoMarker"/);
  assert.match(html,/id="clearBtn"/);
  assert.match(app,/label\.textContent=volume\.synthetic\?'':volume\.name/);
});

test('all three viewers use the same header and control-row heights',()=>{
  assert.equal((html.match(/class="viewer-controls"/g)||[]).length,2);
  assert.match(css,/\.viewport-title\s*\{[^}]*height:47px/);
  assert.match(css,/\.viewer-controls\s*\{[^}]*height:43px/);
  assert.match(css,/\.manual-toolbar\s*\{[^}]*height:43px/);
  assert.match(css,/\.canvas-wrap,\.result-viewport \.canvas-wrap\{height:/);
});
