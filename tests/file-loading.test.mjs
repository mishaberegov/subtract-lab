import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import * as fflate from 'fflate';
import {dicomSlice} from '../scripts/fixtures.mjs';

const parser=createRequire(import.meta.url)('dicom-parser');
// dicom.mjs is imported by the actual worker through Node's module loader.
globalThis.dicomParser=parser;
globalThis.fflate=fflate;
const workerURL=new URL('../dist/io-worker.js',import.meta.url);
const source=await readFile(workerURL,'utf8');
const slices=[2,0,1].map(z=>({name:'IMG-0003-'+String(z+1).padStart(5,'0')+'.dcm',bytes:dicomSlice({z})}));

async function runWorker(files,{expectHalf=false}={}){
  const messages=[];
  const self={postMessage:message=>messages.push(message)};
  vm.runInNewContext(source,{self,Uint8Array,ArrayBuffer,DataView,URL,dicomParser:parser,fflate,importScripts(){}},{filename:fileURLToPath(workerURL),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
  await self.onmessage({data:{type:'scan',slot:'a',files}});
  assert.equal(messages.find(m=>m.type==='error'),undefined,JSON.stringify(messages.find(m=>m.type==='error')));
  const groups=messages.find(m=>m.type==='groups');
  assert.equal(groups.groups.length,1);
  assert.equal(groups.skipped,0);
  assert.equal(groups.groups[0].frames,3);
  await self.onmessage({data:{type:'build',key:groups.groups[0].key}});
  assert.equal(messages.find(m=>m.type==='error'),undefined,JSON.stringify(messages.find(m=>m.type==='error')));
  const volume=messages.find(m=>m.type==='volume').volume;
  assert.deepEqual(volume.dims,[5,4,3]);
  assert.ok(expectHalf?volume.data instanceof Float16Array:volume.data instanceof Float32Array);
  assert.equal(volume.data[0],expectHalf?-1000:0);
  assert.equal(volume.data[20],expectHalf?-980:20);
  assert.equal(volume.data[40],expectHalf?-960:40);
}

test('direct DICOM File inputs with a native Blob.bytes() method load through the worker',async()=>{
  const files=slices.map(s=>new File([s.bytes],s.name));
  assert.equal(typeof files[0].bytes,'function');
  await runWorker(files);
});

test('folder-selected DICOM files load through the same worker path',async()=>{
  const files=slices.map(s=>{const f=new File([s.bytes],s.name);Object.defineProperty(f,'webkitRelativePath',{value:'series/'+s.name});return f;});
  await runWorker(files);
});

test('CT load worker transfers a Float16 volume after DICOM rescale',async()=>{
  const files=[2,0,1].map(z=>new File([dicomSlice({z,modality:'CT',signed:true,intercept:-1000})],`ct-${z}.dcm`));
  await runWorker(files,{expectHalf:true});
});

test('ZIP entries remain compatible with byte-array loading',async()=>{
  const zip=fflate.zipSync(Object.fromEntries(slices.map(s=>[s.name,s.bytes])));
  await runWorker([new File([zip],'series.zip')]);
});
