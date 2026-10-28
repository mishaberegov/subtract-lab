import test from 'node:test';
import assert from 'node:assert/strict';
import {fusionColor,fusionAlpha,composeFusion} from '../dist/fusion.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('Boojum 256-entry CLUT exactly matches the supplied plist channels',()=>{
  const rgb=Uint8Array.from(Array.from({length:256},(_,i)=>fusionColor(i/255)).flat());
  assert.equal(createHash('sha256').update(rgb).digest('hex'),'f9b87556020843ad3c00b652a11e70132f203788506fa0df058aab8899508e8d');
  assert.deepEqual(fusionColor(66/255),[99,126,144]);
  assert.deepEqual(fusionColor(153/255),[224,24,15]);
  assert.deepEqual(fusionColor(1),[254,255,254]);
  assert.deepEqual(fusionColor(NaN),[0,0,0]);
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
  assert.deepEqual(composeFusion(.4,1,1,.15,true),[254,255,254]);
  assert.deepEqual(composeFusion(.4,.5,.5,.15,false),[145,78,77]);
});
test('UI has a colored overlay with adjustable opacity threshold and constant-opacity fallback',()=>{
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
  assert.match(html,/id="fusionThreshold"/);
  assert.match(html,/id="fusionVariableAlpha"/);
  assert.match(app,/composeFusion\(/);
  assert.match(app,/offscreen\.fusion/);
});
