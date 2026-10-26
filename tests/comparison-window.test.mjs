import test from 'node:test';
import assert from 'node:assert/strict';
import {imageBounds,pointerToImage,isRevealed} from '../dist/comparison-window.mjs';
import {readFileSync} from 'node:fs';

test('frameless window selects B only within movable rectangle over A',()=>{
  const pos={x:.5,y:.5},size=.4;
  assert.equal(isRevealed(50,50,100,100,pos,size),true);
  assert.equal(isRevealed(29,50,100,100,pos,size),false);
  assert.equal(isRevealed(70,50,100,100,pos,size),true);
  assert.equal(isRevealed(71,50,100,100,pos,size),false);
});

test('pointer position maps to image voxels through letterbox, aspect ratio and zoom',()=>{
  const pi={w:100,h:50,sx:1,sy:2},canvas={width:400,height:300};
  const b=imageBounds(canvas,pi,1);
  assert.equal(pointerToImage(b.x+b.w/2,b.y+b.h/2,canvas,pi,1).x,.5);
  assert.equal(pointerToImage(b.x+b.w/2,b.y+b.h/2,canvas,pi,1).y,.5);
  assert.equal(pointerToImage(b.x,b.y,canvas,pi,1).x,0);
  assert.equal(pointerToImage(b.x+b.w,b.y+b.h,canvas,pi,1).y,1);
  const z=imageBounds(canvas,pi,2);
  assert.equal(pointerToImage(z.x+z.w/4,z.y+z.h/4,canvas,pi,2).x,.25);
});

test('comparison controls replace checkerboard with window mode',()=>{
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/data-display="checker"/);
  assert.match(html,/data-display="window"/);
});
