import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');

test('Register action replaces result title in the third viewer',()=>{
  const result=html.slice(html.indexOf('id="viewR"'),html.indexOf('</section>',html.indexOf('id="viewR"')));
  assert.match(result,/<div class="viewport-title">[\s\S]*?id="registerBtn"/);
  assert.doesNotMatch(result,/id="resultTitle"/);
  assert.equal((html.match(/id="registerBtn"/g)||[]).length,1);
  assert.doesNotMatch(app,/\$\('resultTitle'\)/);
});

test('manual hint lives over result image and only shows while editing',()=>{
  const result=html.slice(html.indexOf('id="viewR"'),html.indexOf('</section>',html.indexOf('id="viewR"')));
  const canvas=result.slice(result.indexOf('class="canvas-wrap"'),result.indexOf('class="result-tabs'));
  assert.match(canvas,/class="manual-on-image"[^>]*hidden/);
  assert.match(app,/\$\('manualHint'\)\.hidden=!\$\('manualMode'\)\.checked/);
  assert.match(app,/\$\('manualHint'\)\.hidden=true/);
});
