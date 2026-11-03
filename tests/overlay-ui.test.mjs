import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');

test('result viewport offers a Boojum/grayscale LUT choice only for overlay',()=>{
  assert.match(html,/id="overlayLut"/);
  assert.match(html,/value="boojum"/);
  assert.match(html,/value="gray"/);
  assert.match(app,/overlayLut.*hidden/);
});
test('grayscale preview and DICOM export use the same B-grid overlay sampler',()=>{
  assert.match(app,/createBGridOverlay\(/);
  assert.match(app,/overlay\.at\(/);
  assert.match(app,/overlay\.slice\(/);
  assert.match(html,/id="overlaySlice"/);
  assert.match(html,/id="exportOverlayDicom"/);
});
test('DICOM export is disabled for synthetic demo and B without study provenance',()=>{
  assert.match(app,/state\.b\?\.study\?\.studyUID/);
  assert.match(app,/state\.b\?\.frameUID/);
});
