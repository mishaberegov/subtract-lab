import test from 'node:test';
import assert from 'node:assert/strict';
import {compactCTVolume} from '../dist/precision.mjs';
import {sample,difference,registerRigid,makeDemo} from '../dist/core.mjs';
import {resampleToReference} from '../dist/resampling.mjs';

const volume=(data,modality='CT')=>({data:new Float32Array(data),modality,dims:[data.length,1,1],matrix:[1,0,0,0,1,0,0,0,1],origin:[0,0,0],stats:{lo:-1000,hi:3000}});

test('CT stores half-size Float16 voxels with NaN and usable rescaled intensity',()=>{
  const v=volume([-1024,NaN,0.125,36.3,1024,3000]);
  const result=compactCTVolume(v);
  assert.strictEqual(result,v);
  assert.ok(v.data instanceof Float16Array);
  assert.equal(v.data.byteLength,12);
  assert.ok(Number.isNaN(v.data[1]));
  assert.ok(Math.abs(sample(v,3,0,0)-36.3)<=0.125);
  assert.ok(Math.abs(difference(v.data[3],35,{level:40,width:80},{level:40,width:80},true)-1.3)<=0.125);
  assert.match(v.warnings.join(' '),/Float16/);
});

test('unsupported browsers, non-CT and out-of-range CT retain Float32 without partial mutation',()=>{
  for(const [v,ctor] of [[volume([1,2]),undefined],[volume([1,2],'MR'),Float16Array],[volume([1,1e6]),Float16Array],[volume([1,16386]),Float16Array]]){
    const original=v.data;
    compactCTVolume(v,{Float16Ctor:ctor});
    assert.strictEqual(v.data,original);
    assert.equal(v.warnings?.length??0,0);
  }
});

test('Float16 moving voxels survive worker cloning and resample to Float32 with missing values',async()=>{
  const a=volume([10,20,30,40]),b=volume([11,NaN,31,41]);
  compactCTVolume(a);compactCTVolume(b);
  const moving=structuredClone(b);
  const aligned=await resampleToReference(a,moving,[0,0,0,0,0,0],{antiAlias:false});
  assert.ok(aligned.data instanceof Float32Array);
  assert.deepEqual(Array.from(aligned.data).map(x=>Number.isNaN(x)?null:x),[11,null,31,41]);
  assert.equal(aligned.data[0]-a.data[0],1);
});

test('CT Float16 demo-scale registration preserves a computable result',async()=>{
  const {a,b}=makeDemo();a.modality=b.modality='CT';
  compactCTVolume(a);compactCTVolume(b);
  assert.ok(a.data instanceof Float16Array&&b.data instanceof Float16Array);
  const r=await registerRigid(a,b,{method:'ncc',quality:'quick'});
  assert.ok(Number.isFinite(r.after.score));
});
