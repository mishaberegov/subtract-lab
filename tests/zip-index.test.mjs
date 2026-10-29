import test from 'node:test';
import assert from 'node:assert/strict';
import * as fflate from 'fflate';
import {indexZip,readIndexedEntry} from '../dist/zip-index.mjs';
import {dicomSlice} from '../scripts/fixtures.mjs';
globalThis.fflate=fflate;

test('ZIP64 end-of-directory identifies entries without loading member bytes',async()=>{
  const original=fflate.zipSync({'slice.dcm':dicomSlice()},{level:0}),eocd=original.length-22;
  const old=new DataView(original.buffer,original.byteOffset,original.byteLength);
  const zip=new Uint8Array(original.length+76),v=new DataView(zip.buffer);
  zip.set(original.subarray(0,eocd));
  const z=eocd,locator=z+56,end=locator+20;
  v.setUint32(z,0x06064b50,true);v.setBigUint64(z+4,48n,true);
  v.setUint16(z+12,45,true);v.setUint16(z+14,45,true);
  v.setBigUint64(z+24,1n,true);v.setBigUint64(z+32,1n,true);
  v.setBigUint64(z+40,BigInt(old.getUint32(eocd+12,true)),true);
  v.setBigUint64(z+48,BigInt(old.getUint32(eocd+16,true)),true);
  v.setUint32(locator,0x07064b50,true);v.setBigUint64(locator+8,BigInt(z),true);v.setUint32(locator+16,1,true);
  zip.set(original.subarray(eocd),end);
  v.setUint16(end+8,65535,true);v.setUint16(end+10,65535,true);
  v.setUint32(end+12,0xffffffff,true);v.setUint32(end+16,0xffffffff,true);
  const entries=await indexZip(new File([zip],'zip64.zip'));
  assert.equal(entries.length,1);assert.equal(entries[0].name,'slice.dcm');
});

test('data-descriptor flag can use central-directory size for selected member',async()=>{
  const content=dicomSlice(),zip=fflate.zipSync({'slice.dcm':content},{level:0}),v=new DataView(zip.buffer,zip.byteOffset,zip.byteLength);
  const central=zip.findIndex((_,i)=>i+4<zip.length&&v.getUint32(i,true)===0x02014b50);
  assert.ok(central>0);
  v.setUint16(6,v.getUint16(6,true)|8,true);
  v.setUint16(central+8,v.getUint16(central+8,true)|8,true);
  v.setUint32(18,0,true);v.setUint32(22,0,true);
  const file=new File([zip],'descriptor.zip'),entries=await indexZip(file),chunks=[];
  await readIndexedEntry(file,entries[0],chunk=>{chunks.push(chunk.slice());return false;});
  assert.deepEqual(Buffer.concat(chunks.map(c=>Buffer.from(c))),Buffer.from(content));
});
