import test from 'node:test';
import assert from 'node:assert/strict';
import {resampleToReference,resamplingPlan,gridSpacing} from '../dist/resampling.mjs';
import {world,rotation,center,mv} from '../dist/core.mjs';

function volume(dims,matrix,origin,fn){
  const v={dims,matrix,origin,name:'Synthetic volume',modality:'MR',frameUID:'synthetic',data:new Float32Array(dims.reduce((a,b)=>a*b,1))};
  for(let z=0;z<dims[2];z++)for(let y=0;y<dims[1];y++)for(let x=0;x<dims[0];x++)v.data[(z*dims[1]+y)*dims[0]+x]=fn(world(v,[x,y,z]),[x,y,z]);
  return v;
}
test('complete B-on-A volume exactly inherits reference dimensions, origin and oblique grid',async()=>{
  const a={dims:[5,4,7],matrix:[0,-1.4,0,1.1,0,0,0,0,.7],origin:[0,-2,-3],frameUID:'reference'},f=p=>3*p[0]+5*p[1]+7*p[2],b=volume([12,12,12],[2,0,0,0,2,0,0,0,2],[-10,-10,-10],f),params=[1.2,-.8,.4,3,-2,5];
  const out=await resampleToReference(a,b,params),r=rotation(params),c=center(a);
  assert.deepEqual(out.dims,a.dims);assert.deepEqual(out.origin,a.origin);assert.deepEqual(out.matrix,a.matrix);assert.equal(out.frameUID,a.frameUID);assert.equal(out.data.length,5*4*7);
  for(let z=0;z<a.dims[2];z++)for(let y=0;y<a.dims[1];y++)for(let x=0;x<a.dims[0];x++){
    const wp=world(a,[x,y,z]),rotated=mv(r,wp.map((p,i)=>p-c[i])).map((p,i)=>p+c[i]+params[i]),expected=f(rotated),value=out.data[(z*a.dims[1]+y)*a.dims[0]+x];assert.ok(Math.abs(value-expected)<.00005);
  }
});
test('equal grids preserve finite intensities and missing voxels without smoothing',async()=>{
  const b=volume([4,5,6],[1,0,0,0,1,0,0,0,1],[2,4,7],p=>p[0]+p[1]+p[2]);b.data[7]=NaN;const before=b.data.slice();
  const out=await resampleToReference(b,b);assert.deepEqual(out.data,before);assert.deepEqual(b.data,before);assert.notEqual(out.data,b.data);assert.equal(out.resampling.filterApplied,false);
});
test('1 mm -> 4 mm downsampling suppresses alternating-slice aliasing and preserves the input',async()=>{
  const b=volume([3,3,33],[1,0,0,0,1,0,0,0,1],[0,0,0],(_,p)=>p[2]%2?1000:0),a={dims:[3,3,9],matrix:[1,0,0,0,1,0,0,0,4],origin:[0,0,0],sliceThicknessMm:4};b.sliceThicknessMm=1;const before=b.data.slice();
  const filtered=await resampleToReference(a,b),unfiltered=await resampleToReference(a,b,[0,0,0,0,0,0],{antiAlias:false}),middle=(4*3+1)*3+1;
  assert.ok(filtered.resampling.filterApplied);assert.ok(filtered.data[middle]>480&&filtered.data[middle]<520);assert.equal(unfiltered.data[middle],0);assert.deepEqual(gridSpacing(filtered),[1,1,4]);assert.deepEqual(b.data,before);assert.equal(filtered.resampling.referenceSliceThicknessMm,4);assert.equal(filtered.resampling.sourceSliceThicknessMm,1);
});
test('3 mm -> 1 mm upsampling interpolates between source slices with no extra blur',async()=>{
  const b=volume([3,3,5],[1,0,0,0,1,0,0,0,3],[0,0,0],p=>100*p[2]),a={dims:[3,3,13],matrix:[1,0,0,0,1,0,0,0,1],origin:[0,0,0]};
  const out=await resampleToReference(a,b);assert.equal(out.resampling.filterApplied,false);for(let z=0;z<13;z++)assert.ok(Math.abs(out.data[(z*3+1)*3+1]-100*z)<.001);
});
test('out-of-FOV voxels stay NaN, including after translation, rather than producing false subtraction',async()=>{
  const b=volume([2,2,2],[1,0,0,0,1,0,0,0,1],[0,0,0],()=>9),a={dims:[3,2,2],matrix:[1,0,0,0,1,0,0,0,1],origin:[-1,0,0]};
  const out=await resampleToReference(a,b);assert.ok(Number.isNaN(out.data[0]));assert.equal(out.data[1],9);assert.equal(out.resampling.validFraction,2/3);
  await assert.rejects(()=>resampleToReference(a,b,[100,0,0,0,0,0]),/нет перекрытия/);
});
test('anti-alias filter only affects source axes that are coarser in the target footprint',()=>{
  const a={dims:[4,4,4],matrix:[1,0,0,0,1,0,0,0,4],origin:[0,0,0]},b={dims:[4,4,16],matrix:[1,0,0,0,1,0,0,0,1],origin:[0,0,0]},plan=resamplingPlan(a,b);
  assert.equal(plan.sigmaVox[0],0);assert.equal(plan.sigmaVox[1],0);assert.ok(plan.sigmaVox[2]>0);
});
