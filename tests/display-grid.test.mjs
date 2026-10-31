import test from 'node:test';
import assert from 'node:assert/strict';
import {displayExtent,displayPlane} from '../dist/display-grid.mjs';
import {samplingMap,mapped,sample} from '../dist/core.mjs';

const volume=(dims,origin,matrix=[1,0,0,0,1,0,0,0,1])=>({dims,origin,matrix,data:new Float32Array(dims.reduce((p,n)=>p*n,1)).fill(42)});

test('display grid includes B beyond A in all three planes without extending A data',()=>{
  const a=volume([4,4,3],[0,0,0]),b=volume([4,4,3],[3,-2,4]);
  const axial=displayExtent(a,b,[0,0,0,0,0,0],'axial');
  assert.deepEqual([axial.min,axial.max,axial.w,axial.h],[0,6,7,6]);
  const pi=displayPlane(a,'axial',5,axial);
  assert.deepEqual(pi.voxel(6,0),[6,-2,5]);
  assert.ok(Number.isFinite(sample(b,...mapped(samplingMap(a,b),...pi.voxel(6,0)))));
  assert.ok(pi.voxel(6,0)[0]>=a.dims[0]);
  const coronal=displayExtent(a,b,[0,0,0,0,0,0],'coronal');
  assert.deepEqual([coronal.min,coronal.max,coronal.w,coronal.h],[-2,3,7,7]);
  const sagittal=displayExtent(a,b,[0,0,0,0,0,0],'sagittal');
  assert.deepEqual([sagittal.min,sagittal.max,sagittal.w,sagittal.h],[0,6,6,7]);
});

test('registration pose removes an initial large display offset without altering source geometry',()=>{
  const a=volume([32,32,8],[0,0,0]),b=volume([32,32,8],[24,0,0]);
  const initial=displayExtent(a,b,[0,0,0,0,0,0],'axial');
  const aligned=displayExtent(a,b,[24,0,0,0,0,0],'axial');
  assert.deepEqual([initial.w,aligned.w],[56,32]);
  assert.deepEqual([aligned.min,aligned.max,aligned.h],[0,7,32]);
});
test('very distant or corrupt frames do not allocate unbounded image canvases',()=>{
  const a=volume([32,32,8],[0,0,0]),b=volume([32,32,8],[3000,0,0]);
  const extent=displayExtent(a,b,[0,0,0,0,0,0],'axial');
  assert.equal(extent.limited,true);
  assert.deepEqual([extent.w,extent.h,extent.min,extent.max],[32,32,0,7]);
});
test('equal grids keep the original plane and slice range',()=>{
  const a=volume([7,6,5],[-3,-2,-1]);
  for(const plane of ['axial','coronal','sagittal']){
    const extent=displayExtent(a,a,[0,0,0,0,0,0],plane);
    const info=displayPlane(a,plane,extent.min,extent);
    assert.deepEqual([extent.min,extent.max,extent.w,extent.h],[0,a.dims[info.normalAxis]-1,info.w,info.h]);
  }
});
