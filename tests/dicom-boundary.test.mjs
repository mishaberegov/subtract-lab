import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {decodeFrame,inflateDicomDataset} from '../dist/dicom.mjs';
const require=createRequire(import.meta.url);
globalThis.fflate=require('fflate');

test('float pixel padding value and range are excluded before rescale',async()=>{
  const buffer=new ArrayBuffer(24),dv=new DataView(buffer);
  dv.setFloat32(0,1000,true);dv.setFloat32(4,1001,true);dv.setFloat32(8,12,true);
  dv.setFloat32(12,1000,true);dv.setFloat32(16,1001,true);
  const ds={byteArray:new Uint8Array(buffer),elements:{x7fe00008:{dataOffset:0,length:12},x00280122:{dataOffset:12,length:4},x00280124:{dataOffset:16,length:4}},string:tag=>tag==='x00020010'?'1.2.840.10008.1.2.1':null,uint16:()=>16};
  const result=await decodeFrame({ds,index:0,rows:1,cols:3,slope:2,intercept:3});
  assert.ok(Number.isNaN(result[0]));assert.ok(Number.isNaN(result[1]));assert.equal(result[2],27);
});

test('deflated DICOM inflation stops at a byte budget',()=>{
  const compressed=globalThis.fflate.deflateSync(new Uint8Array(2_000_000));
  assert.throws(()=>inflateDicomDataset(compressed,0,1_000_000),/лимит|limit/i);
  const small=globalThis.fflate.deflateSync(Uint8Array.from([1,2,3]));
  assert.deepEqual(Array.from(inflateDicomDataset(small,0,1_000_000)),[1,2,3]);
});
