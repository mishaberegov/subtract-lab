import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNiftiHeader} from '../dist/nifti.mjs';

const volume=dims=>({dims,matrix:[1,0,0,0,1,0,0,0,1],origin:[4,5,6]});

test('NIfTI header preserves the largest representable positive dimension',()=>{
  const header=makeNiftiHeader(volume([32767,2,3]));
  const dv=new DataView(header);
  assert.equal(header.byteLength,352);
  assert.deepEqual([0,1,2].map(i=>dv.getInt16(42+i*2,true)),[32767,2,3]);
  assert.equal(dv.getFloat32(292,true),-4);
});

test('NIfTI header rejects a dimension that would wrap in signed int16',()=>{
  assert.throws(()=>makeNiftiHeader(volume([32768,2,3])),/NIfTI.*32767/i);
});

test('NIfTI header rejects invalid dimensions rather than silently truncating',()=>{
  for(const dim of [0,-1,1.5,Infinity,NaN])
    assert.throws(()=>makeNiftiHeader(volume([dim,2,3])),/NIfTI.*32767/i);
});
