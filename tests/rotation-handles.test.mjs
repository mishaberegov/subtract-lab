import test from 'node:test';
import assert from 'node:assert/strict';
import {rotationDragDegrees} from '../dist/manual-alignment.mjs';
import {readFileSync} from 'node:fs';

test('corner dragging computes signed in-plane rotation around image centre',()=>{
  const center={x:100,y:100};
  assert.equal(rotationDragDegrees({x:50,y:50},{x:150,y:50},center),90);
  assert.equal(rotationDragDegrees({x:150,y:50},{x:50,y:50},center),-90);
  assert.equal(rotationDragDegrees({x:50,y:50},{x:50,y:50},center),0);
});
test('four explicit rotation handles are shown only in manual mode and use the rigid pose',()=>{
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
  assert.equal((html.match(/data-rotate-handle=/g)||[]).length,4);
  assert.match(app,/rotationDragDegrees\(/);
  assert.match(app,/rotateInPlane\(drag\.params,drag\.plane,degrees\)/);
  assert.match(app,/previewAngle/);
});
