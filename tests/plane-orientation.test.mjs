import test from 'node:test';
import assert from 'node:assert/strict';
import {sourcePlane, planeMapping} from '../dist/orientation.mjs';

const axial={dims:[8,9,10],matrix:[1,0,0,0,1,0,0,0,2]};
// DICOM row direction P, column direction I, slice normal R: original slices are sagittal.
const sagittal={dims:[8,9,10],matrix:[0,0,-2,1,0,0,0,-1,0]};

test('source slice plane follows physical DICOM orientation, not slice index label',()=>{
  assert.equal(sourcePlane(axial),'axial');
  assert.equal(sourcePlane(sagittal),'sagittal');
  const p=planeMapping(sagittal,'sagittal',4);
  assert.equal(p.normalAxis,2);
  assert.equal(p.w,8);assert.equal(p.h,9);
  assert.deepEqual(p.voxel(2,3),[2,3,4]);
  assert.deepEqual(p.u,[0,1,0]);assert.deepEqual(p.v,[0,0,-1]);
});

test('anatomical plane buttons select physical axis in sagittal acquisition',()=>{
  assert.equal(planeMapping(sagittal,'coronal',2).normalAxis,0);
  assert.equal(planeMapping(sagittal,'axial',2).normalAxis,1);
  assert.equal(planeMapping(axial,'sagittal',2).normalAxis,0);
  assert.equal(planeMapping(axial,'coronal',2).normalAxis,1);
  assert.equal(planeMapping(axial,'axial',2).normalAxis,2);
});
