import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {averageResultSlab} from '../dist/result-slab.mjs';
const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');

test('averages the signed result in the current plane, not the source images',()=>{
  const values=[1,3,7,11,17],read=p=>values[p[2]];
  assert.equal(averageResultSlab([1,1,2],2,[3,3,5],1,read),7);
  assert.equal(averageResultSlab([1,1,2],2,[3,3,5],3,read),7);
  assert.equal(averageResultSlab([1,1,2],2,[3,3,5],5,read),39/5);
  assert.equal(averageResultSlab([1,2,1],0,[3,3,5],3,p=>p[0]*10),10);
});
test('edges use available slices, missing centre remains missing, gaps are not filled',()=>{
  const values=[2,4,NaN,8,10],read=p=>values[p[2]];
  assert.equal(averageResultSlab([0,0,0],2,[2,2,5],3,read),3);
  assert.ok(Number.isNaN(averageResultSlab([0,0,2],2,[2,2,5],5,read)));
  assert.equal(averageResultSlab([0,0,3],2,[2,2,5],3,read),9);
  assert.ok(Number.isNaN(averageResultSlab([2,0,0],2,[2,2,5],3,read)));
});
test('averaging lives next to manual alignment and is hidden outside difference',()=>{
  const toolbar=html.match(/<div class="manual-toolbar">([\s\S]*?)<div class="canvas-wrap"/)?.[1];
  assert.ok(toolbar,'manual toolbar exists');
  assert.match(toolbar,/id="manualMode"[\s\S]*id="resultSlab"[\s\S]*id="resetTransform"/);
  assert.match(app,/\$\('slabControl'\)\.hidden=state\.display!=='difference'/);
  assert.doesNotMatch(html.match(/<div class="slice-navigation">[\s\S]*?<div class="workspace-bottom">/)?.[0]||'',/id="resultSlab"/);
});
test('result-only slab is selectable in three modes and does not change NIfTI or registration',()=>{
  assert.match(html,/id="resultSlab"[^>]*>[\s\S]*?value="1"[\s\S]*?value="3"[\s\S]*?value="5"/);
  assert.match(app,/state\.display==='difference'&&slabCount>1\?averageResultSlab\(/);
  assert.match(app,/\$\('resultSlab'\)\.disabled=state\.display!=='difference'/);
  assert.doesNotMatch(app.match(/async function exportNifti\(\)[\s\S]*?\n\}/)?.[0]||'',/resultSlab|averageResultSlab/);
});
