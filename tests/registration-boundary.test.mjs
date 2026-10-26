import test from 'node:test';
import assert from 'node:assert/strict';
import {registerRigid} from '../dist/core.mjs';

test('single-resolution registration refines a subvoxel translation', async () => {
  const dims=[24,24,12], matrix=[1,0,0,0,1,0,0,0,1], origin=[0,0,0];
  const intensity=(x,y,z) => {
    const envelope=Math.exp(-((x-12)**2+(y-12)**2+(z-6)**2)/24);
    return envelope*(100 + 35*Math.sin(x*.65+y*.19)+25*Math.cos(x*.27-z*.73)
      + 20*Math.sin(y*.55+z*.35));
  };
  const volume=shift => ({dims,matrix,origin,data:Float32Array.from(
    {length:dims[0]*dims[1]*dims[2]},(_,i)=>{
      const x=i%dims[0],y=Math.floor(i/dims[0])%dims[1],z=Math.floor(i/(dims[0]*dims[1]));
      return intensity(x-shift,y,z);
    })});
  const result=await registerRigid(volume(0),volume(.4));
  assert.ok(Math.abs(result.params[0]-.4)<.25,`expected 0.4 mm, got ${result.params[0]} mm`);
  assert.ok(result.after.score>result.before.score, 'registration improves alignment');
});
