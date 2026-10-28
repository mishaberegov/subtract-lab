import test from 'node:test';
import assert from 'node:assert/strict';
import {hotColor,fusionAlpha,composeFusion} from '../dist/fusion.mjs';
import {readFileSync} from 'node:fs';

test('hot CLUT maps normalized B to stable warm RGB colors',()=>{
  assert.deepEqual(hotColor(0),[0,0,0]);
  assert.deepEqual(hotColor(1),[255,255,255]);
  assert.ok(hotColor(.5)[0]>hotColor(.5)[2]);
});
test('low B intensity is transparent and higher B is increasingly visible',()=>{
  assert.equal(fusionAlpha(0,1,.15,true),0);
  assert.equal(fusionAlpha(.15,.5,.15,true),0);
  assert.ok(fusionAlpha(.5,.5,.15,true)>0);
  assert.equal(fusionAlpha(1,.5,.15,true),.5);
  assert.equal(fusionAlpha(.2,.5,.15,false),.5);
  assert.equal(fusionAlpha(.8,0,.15,true),0);
});
test('fusion leaves A intact for missing B and blends RGB against A gray',()=>{
  assert.deepEqual(composeFusion(.4,NaN,1,.15,true),[102,102,102]);
  assert.deepEqual(composeFusion(.4,.8,0,.15,true),[102,102,102]);
  assert.deepEqual(composeFusion(.4,1,1,.15,true),[255,255,255]);
  assert.deepEqual(composeFusion(.4,.5,.5,.15,false),[153,102,51]);
});
test('UI has a colored overlay with adjustable opacity threshold and constant-opacity fallback',()=>{
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
  assert.match(html,/id="fusionThreshold"/);
  assert.match(html,/id="fusionVariableAlpha"/);
  assert.match(app,/composeFusion\(/);
  assert.match(app,/offscreen\.fusion/);
});
