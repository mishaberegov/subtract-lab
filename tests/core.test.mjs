import test from 'node:test';
import assert from 'node:assert/strict';
import {sample,world,mapped,samplingMap,windowValue,difference,makeDemo,registerRigid} from '../dist/core.mjs';
test('physical sampling honors oblique geometry, origins and differing spacing',()=>{
  const a={dims:[5,6,7],origin:[-11,3,4],matrix:[0,-2,0,1.5,0,0,0,0,3]},b={dims:[12,14,20],origin:[-9,-1,0],matrix:[0,-1,0,1,0,0,0,0,1.5]};
  const p=[2,3,4],mappedVoxel=mapped(samplingMap(a,b),...p),wp=world(a,p),wq=world(b,mappedVoxel);wq.forEach((v,i)=>assert.ok(Math.abs(v-wp[i])<1e-10));
});
test('trilinear interpolation, missing overlap, exact endpoints and DICOM windows',()=>{
  const v={dims:[2,2,2],data:new Float32Array([0,1,2,3,4,5,6,7])};assert.equal(sample(v,.5,.5,.5),3.5);assert.equal(sample(v,1,1,1),7);assert.ok(Number.isNaN(sample(v,-.1,0,0)));
  v.data[1]=NaN;assert.equal(sample(v,0,0,0),0);assert.ok(Number.isNaN(sample(v,.5,0,0)));
  assert.equal(windowValue(-100,50,100),0);assert.equal(windowValue(99,50,100),1);assert.equal(windowValue(49.5,50,100),.5);assert.equal(windowValue(50,50,1),1);assert.equal(windowValue(49,50,1),0);
});
test('independent windows cancel affine intensity differences; raw mode retains them',()=>{
  const a=350,b=a*2+80,wa={level:500,width:1000},wb={level:(wa.level-.5)*2+80+.5,width:(wa.width-1)*2+1};assert.ok(Math.abs(difference(a,b,wa,wb))<1e-12);assert.equal(difference(a,b,wa,wb,true),-430);assert.ok(Number.isNaN(difference(a,NaN,wa,wb)));
});
test('rigid registration recovers known translation and rotation despite gain, offset and lesion',async()=>{
  const {a,b,known}=makeDemo();const r=await registerRigid(a,b);
  r.params.forEach((v,i)=>assert.ok(Math.abs(v-known[i])<(i<3?.65:.5),'parameter '+i+': '+v+' vs '+known[i]));assert.ok(r.after.ncc>.94);assert.ok(r.after.score>r.before.score+.2);
});
test('head-only moving CT aligns with a longer head-and-neck fixed scan',async()=>{
  const {a:head,b,known}=makeDemo(64),extra=240,[nx,ny,nz]=head.dims,stride=nx*ny;
  const data=new Float32Array(stride*(nz+extra));data.set(head.data,stride*extra);
  for(let z=0;z<extra;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const r=((x-nx/2)/(nx*.38))**2+((y-ny/2)/(ny*.38))**2;
    data[(z*ny+y)*nx+x]=r<1?(r>.75?600:180+35*Math.sin(x*.3+z*.2)):0;
  }
  const fixed={...head,dims:[nx,ny,nz+extra],origin:[head.origin[0],head.origin[1],head.origin[2]-extra*head.matrix[8]],data};delete fixed.stats;
  const result=await registerRigid(fixed,b);
  assert.ok(result.after.ncc>.8,JSON.stringify(result));
  assert.ok(Math.abs(result.params[2]-known[2])<5,JSON.stringify(result));
});
test('mutual information registration improves correspondence for inverted contrast',async()=>{
  const {a,b}=makeDemo();for(let i=0;i<b.data.length;i++)b.data[i]=1400-b.data[i];delete b.stats;
  const r=await registerRigid(a,b,{method:'mi'});assert.ok(r.after.score>r.before.score+.05);assert.ok(Math.abs(r.after.ncc)>.85);
});
