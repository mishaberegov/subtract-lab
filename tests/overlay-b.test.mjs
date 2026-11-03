import test from 'node:test';
import assert from 'node:assert/strict';
import {createBGridOverlay} from '../dist/overlay-b.mjs';
import {composeGrayFusion} from '../dist/fusion.mjs';

const v=(data,dims,origin=[0,0,0],matrix=[1,0,0,0,1,0,0,0,1])=>({data:Float32Array.from(data),dims,origin,matrix});
const windows={a:{level:100,width:201},b:{level:100,width:201}};
const options={windows,opacity:0.5,threshold:0.15,variableAlpha:false};

test('grayscale overlay blends windowed A and B with the same alpha as its preview',()=>{
  assert.equal(composeGrayFusion(.2,.8,.5,.15,false),128);
  const overlay=createBGridOverlay(v([40],[1,1,1]),v([160],[1,1,1]),[0,0,0,0,0,0],options);
  assert.deepEqual([...overlay.slice(0)],[128]);
  assert.equal(overlay.at(0,0,0),overlay.slice(0)[0]);
});

test('inverse registration maps moving B voxels into fixed A, not the other way around',()=>{
  const a=v([0,100,200],[3,1,1]);
  const b=v([100,100,100],[3,1,1]);
  const overlay=createBGridOverlay(a,b,[-1,0,0,0,0,0],{...options,opacity:0});
  assert.deepEqual([...overlay.slice(0)],[128,255,128]); // B[0] samples A[1], outside A uses B
});

test('B field outside A retains windowed B, without checkerboard or invented A',()=>{
  const overlay=createBGridOverlay(v([100],[1,1,1]),v([0,100,200],[3,1,1]),[0,0,0,0,0,0],options);
  assert.deepEqual([...overlay.slice(0)],[64,128,255]);
});

test('B voxel geometry can be oblique and anisotropic',()=>{
  const a=v([0,100,200],[3,1,1]);
  const b=v([100,100,100],[3,1,1],[0,0,0],[2,0,0,0,1,0,0,0,1]);
  const overlay=createBGridOverlay(a,b,[0,0,0,0,0,0],{...options,opacity:0});
  assert.deepEqual([...overlay.slice(0)],[1,255,128]);
});
