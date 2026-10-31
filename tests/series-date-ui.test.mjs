import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../dist/app.mjs',import.meta.url),'utf8');
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');

test('series chooser and both image corners display the date source',()=>{
  for(const slot of ['A','B']){
    assert.match(html,new RegExp(`id="date${slot}"`));
    assert.match(app,new RegExp(`\\$\\('date'\\+up\\)`));
  }
  assert.match(app,/formatSeriesDate\(group,language\)/);
  assert.match(app,/language==='ru'\?'серия':'series'/);
  assert.match(app,/formatSeriesDate\(volume,language\)/);
});
