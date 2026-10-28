import test from 'node:test';
import assert from 'node:assert/strict';
import {dragTranslation,rotateInPlane} from '../dist/manual-alignment.mjs';
import {planeMapping} from '../dist/orientation.mjs';
import {imageBounds} from '../dist/comparison-window.mjs';
import {rotation,mv} from '../dist/core.mjs';

const v={dims:[100,80,60],matrix:[1,0,0,0,2,0,0,0,3]};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('drag maps letterboxed canvas pixels and zoom to inverse A-to-B translation',()=>{
  const plane=planeMapping(v,'axial',20),canvas={width:600,height:500},bounds=imageBounds(canvas,plane,2);
  const params=dragTranslation([0,0,0,0,0,0],{x:bounds.x+12,y:bounds.y+17},{x:bounds.x+12+bounds.w/10,y:bounds.y+17+bounds.h/8},canvas,plane,2);
  near(params[0],-10);near(params[1],-20);near(params[2],0);
});

test('drag uses signed oblique physical axes and existing rotation',()=>{
  const oblique={dims:[20,20,20],matrix:[0,-2,0,1,0,0,0,0,3]};
  const p=planeMapping(oblique,'axial',10),canvas={width:450,height:350},b=imageBounds(canvas,p,1);
  const initial=[3,4,5,0,0,90];
  const actual=dragTranslation(initial,{x:b.x,y:b.y},{x:b.x+b.w/p.w,y:b.y},canvas,p,1);
  const expected=mv(rotation(initial),p.u).map((x,i)=>initial[i]-x);
  actual.slice(0,3).forEach((x,i)=>near(x,expected[i]));
});

test('plane rotation composes existing 3D pose in sagittal plane',()=>{
  const initial=[2,3,4,9,18,27],plane=planeMapping(v,'sagittal',10);
  const next=rotateInPlane(initial,plane,2);
  const normal=[plane.u[1]*plane.v[2]-plane.u[2]*plane.v[1],plane.u[2]*plane.v[0]-plane.u[0]*plane.v[2],plane.u[0]*plane.v[1]-plane.u[1]*plane.v[0]];
  const n=normal.map(x=>x/Math.hypot(...normal));
  const old=mv(rotation(initial),n),after=mv(rotation(next),n);
  next.slice(0,3).forEach((x,i)=>near(x,initial[i]));
  after.forEach((x,i)=>near(x,old[i]));
  assert.ok(Math.abs(next[3]-initial[3])>0.1,'sagittal rotation must not blindly change Z');
});
