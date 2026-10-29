import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import * as fflate from 'fflate';
globalThis.fflate=fflate;

const workerURL=new URL('../dist/io-worker.js',import.meta.url);
const source=await readFile(workerURL,'utf8');
// Replace only the ZIP output limits; fixtures stay kilobytes, never gigabytes.
const boundedSource=source.replaceAll('600e6','1024').replaceAll('2e9','1536');

async function scan(zip,script=boundedSource,library=fflate){
  const messages=[];
  const self={postMessage:m=>messages.push(m)};
  vm.runInNewContext(script,{self,Uint8Array,ArrayBuffer,DataView,URL,fflate:library,importScripts(){}},{filename:fileURLToPath(workerURL),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
  await self.onmessage({data:{type:'scan',slot:'test',files:[new File([zip],'test.zip')]}});
  return messages;
}

function error(messages){return messages.find(m=>m.type==='error')?.message}

test('ZIP loading never calls whole-archive unzipSync',async()=>{
  const zip=fflate.zipSync({'slice.dcm':new Uint8Array(16)});
  const messages=await scan(zip,boundedSource,{...fflate,unzipSync(){throw Error('whole archive inflated')}});
  assert.notEqual(error(messages),'whole archive inflated');
});

test('rejects an entry whose local uncompressed size advertises more than the per-entry budget',async()=>{
  const zip=fflate.zipSync({'slice.dcm':new Uint8Array(16)});
  new DataView(zip.buffer,zip.byteOffset,zip.byteLength).setUint32(22,1025,true);
  assert.match(error(await scan(zip)),/Слишком большой файл внутри ZIP/);
});

test('rejects actual output over the entry limit even when local ZIP size is forged small',async()=>{
  const zip=fflate.zipSync({'slice.dcm':new Uint8Array(1100).fill(42)});
  new DataView(zip.buffer,zip.byteOffset,zip.byteLength).setUint32(22,1,true);
  assert.match(error(await scan(zip)),/Слишком большой файл внутри ZIP/);
});

test('rejects cumulative output before accepting a later entry',async()=>{
  const zip=fflate.zipSync({'first.dcm':new Uint8Array(800),'second.dcm':new Uint8Array(800)});
  assert.match(error(await scan(zip)),/Распакованный ZIP слишком большой/);
});
test('multiple ZIP files share the same cumulative output budget',async()=>{
  const zip=fflate.zipSync({'slice.dcm':new Uint8Array(800)});
  const messages=[],self={postMessage:m=>messages.push(m)};
  vm.runInNewContext(boundedSource,{self,Uint8Array,ArrayBuffer,DataView,URL,fflate,importScripts(){}},{filename:fileURLToPath(workerURL),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
  await self.onmessage({data:{type:'scan',slot:'test',files:[new File([zip],'first.zip'),new File([zip],'second.zip')]}});
  assert.match(error(messages),/Распакованный ZIP слишком большой/);
});
