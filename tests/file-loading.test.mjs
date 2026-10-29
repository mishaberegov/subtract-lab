import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import * as fflate from 'fflate';
import {dicomSlice,element} from '../scripts/fixtures.mjs';

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

test('folder scan reads headers, then full pixels only for the selected series',async()=>{
  const files=['2.25.10001','2.25.10002'].map((uid,i)=>{
    const bytes=dicomSlice({uid,z:i,rows:256,cols:256,values:Array(256*256).fill(100+i)});
    const file=new File([bytes],`series-${i}.dcm`);
    let fullReads=0,previewBytes=0;
    const read=file.arrayBuffer.bind(file),slice=file.slice.bind(file);
    file.arrayBuffer=async()=>{fullReads++;return read();};
    file.slice=(start,end)=>{previewBytes+=Math.min(end,file.size)-start;return slice(start,end);};
    return {file,get fullReads(){return fullReads},get previewBytes(){return previewBytes}};
  });
  const messages=[],self={postMessage:message=>messages.push(message)};
  vm.runInNewContext(source,{self,Uint8Array,ArrayBuffer,DataView,URL,dicomParser:parser,fflate,importScripts(){}},{filename:fileURLToPath(workerURL),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
  await self.onmessage({data:{type:'scan',slot:'a',files:files.map(x=>x.file)}});
  const groups=messages.find(m=>m.type==='groups');
  assert.equal(groups?.groups.length,2);
  assert.ok(files.every(x=>x.fullReads===0&&x.previewBytes<x.file.size),'scan must not load pixel data');
  await self.onmessage({data:{type:'build',key:groups.groups[0].key}});
  assert.equal(messages.find(m=>m.type==='error'),undefined,JSON.stringify(messages.find(m=>m.type==='error')));
  assert.equal(files.filter(x=>x.fullReads===1).length,1);
  assert.equal(files.filter(x=>x.fullReads===0).length,1);
  assert.ok(messages.some(m=>m.type==='volume'));
});

test('ZIP chooser keeps metadata and reopens archive only for the chosen series',async()=>{
  const contents=Object.fromEntries(['2.25.20001','2.25.20002'].map((uid,i)=>[
    `s${i}/slice.dcm`,dicomSlice({uid,z:0,rows:256,cols:256,values:Array(256*256).fill(100+i)})
  ]));
  const zip=new File([fflate.zipSync(contents,{level:0})],'study.zip');
  let bytesRead=0;
  const slice=zip.slice.bind(zip);
  zip.slice=(start,end)=>{bytesRead+=Math.min(end,zip.size)-start;return slice(start,end);};
  const messages=[],self={postMessage:message=>messages.push(message)};
  vm.runInNewContext(source,{self,Uint8Array,ArrayBuffer,DataView,URL,dicomParser:parser,fflate,importScripts(){}},{filename:fileURLToPath(workerURL),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
  await self.onmessage({data:{type:'scan',slot:'a',files:[zip]}});
  const scanned=bytesRead,groups=messages.find(m=>m.type==='groups');
  assert.equal(groups?.groups.length,2);
  await self.onmessage({data:{type:'build',key:groups.groups[0].key}});
  assert.equal(messages.find(m=>m.type==='error'),undefined,JSON.stringify(messages.find(m=>m.type==='error')));
  assert.ok(bytesRead>scanned,'selected ZIP entries should be read on demand after the chooser');
  assert.equal(messages.find(m=>m.type==='volume').volume.data[0],100);
});

test('metadata beyond the first 64 KB is still discovered before PixelData',async()=>{
  const slice=dicomSlice({rows:256,cols:256,values:Array(256*256).fill(77)});
  const beforePixel=slice.length-12-256*256*2;
  const privateTag=element(0x0029,0x10,'OB',new Uint8Array(70000));
  const bytes=new Uint8Array(slice.length+privateTag.length);
  bytes.set(slice.subarray(0,beforePixel));bytes.set(privateTag,beforePixel);bytes.set(slice.subarray(beforePixel),beforePixel+privateTag.length);
  const file=new File([bytes],'large-header.dcm');
  const messages=[],self={postMessage:message=>messages.push(message)};
  vm.runInNewContext(source,{self,Uint8Array,ArrayBuffer,DataView,URL,dicomParser:parser,fflate,importScripts(){}},{filename:fileURLToPath(workerURL),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
  await self.onmessage({data:{type:'scan',slot:'a',files:[file]}});
  assert.equal(messages.find(m=>m.type==='groups')?.groups[0].frames,1);
});
test('a header ending exactly at a preview boundary still finds its later pixel tag',async()=>{
  const slice=dicomSlice({rows:256,cols:256});
  const beforePixel=slice.length-12-256*256*2;
  const padding=element(0x29,0x10,'OB',new Uint8Array(65536-beforePixel-12));
  const bytes=new Uint8Array(slice.length+padding.length);
  bytes.set(slice.subarray(0,beforePixel));bytes.set(padding,beforePixel);bytes.set(slice.subarray(beforePixel),65536);
  const messages=[],self={postMessage:message=>messages.push(message)};
  vm.runInNewContext(source,{self,Uint8Array,ArrayBuffer,DataView,URL,dicomParser:parser,fflate,importScripts(){}},{filename:fileURLToPath(workerURL),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
  await self.onmessage({data:{type:'scan',slot:'a',files:[new File([bytes],'boundary.dcm')]}});
  assert.equal(messages.find(m=>m.type==='groups')?.groups[0].frames,1);
});
test('ZIP entries with duplicate names do not mix unrelated series on selection',async()=>{
  const zip=fflate.zipSync({
    'a.dcm':dicomSlice({uid:'2.25.30001',values:Array(20).fill(11)}),
    'b.dcm':dicomSlice({uid:'2.25.30002',values:Array(20).fill(22)})
  },{level:0});
  let renamed=0;
  for(let i=0;i<zip.length-5;i++)if(zip[i]===98&&zip[i+1]===46&&zip[i+2]===100&&zip[i+3]===99&&zip[i+4]===109){zip[i]=97;renamed++;}
  assert.equal(renamed,2);
  const messages=[],self={postMessage:message=>messages.push(message)};
  vm.runInNewContext(source,{self,Uint8Array,ArrayBuffer,DataView,URL,dicomParser:parser,fflate,importScripts(){}},{filename:fileURLToPath(workerURL),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
  await self.onmessage({data:{type:'scan',slot:'a',files:[new File([zip],'duplicates.zip')]}});
  const groups=messages.find(m=>m.type==='groups');
  assert.equal(groups?.groups.length,2);
  await self.onmessage({data:{type:'build',key:groups.groups[0].key}});
  assert.equal(messages.find(m=>m.type==='error'),undefined,JSON.stringify(messages.find(m=>m.type==='error')));
  assert.equal(messages.find(m=>m.type==='volume').volume.data[0],11);
});
test('indexed ZIP scans headers and reads only the selected member during build',async()=>{
  const zipBytes=fflate.zipSync({
    'one.dcm':dicomSlice({uid:'2.25.40001',rows:256,cols:256,values:Array(256*256).fill(23)}),
    'two.dcm':dicomSlice({uid:'2.25.40002',rows:256,cols:256,values:Array(256*256).fill(47)})
  },{level:0});
  const file=new File([zipBytes],'indexed.zip');let readBytes=0;
  const slice=file.slice.bind(file);
  file.slice=(start,end)=>{readBytes+=Math.min(end,file.size)-start;return slice(start,end);};
  const messages=[],self={postMessage:message=>messages.push(message)};
  vm.runInNewContext(source,{self,Uint8Array,ArrayBuffer,DataView,URL,dicomParser:parser,fflate,importScripts(){}},{filename:fileURLToPath(workerURL),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
  await self.onmessage({data:{type:'scan',slot:'a',files:[file]}});
  const groups=messages.find(m=>m.type==='groups');
  assert.equal(groups?.groups.length,2);
  assert.ok(readBytes<65557+file.size/5,`header scan read too much compressed pixel data: ${readBytes}`);
  const scannedBytes=readBytes;
  await self.onmessage({data:{type:'build',key:groups.groups[0].key}});
  assert.equal(messages.find(m=>m.type==='error'),undefined,JSON.stringify(messages.find(m=>m.type==='error')));
  assert.ok(readBytes-scannedBytes<file.size,'building one series must skip other compressed members');
  assert.equal(messages.find(m=>m.type==='volume').volume.data[0],23);
});
test('Float Pixel Data is recognized from a header prefix without loading its pixel bytes',async()=>{
  const slice=dicomSlice({rows:256,cols:256}),beforePixel=slice.length-12-256*256*2;
  const floats=new Float32Array(256*256).fill(77.5);
  const pixel=element(0x7fe0,0x08,'OF',new Uint8Array(floats.buffer));
  const bytes=new Uint8Array(beforePixel+pixel.length);
  bytes.set(slice.subarray(0,beforePixel));bytes.set(pixel,beforePixel);
  const file=new File([bytes],'float.dcm');
  let maxRead=0;const sliceFile=file.slice.bind(file);
  file.slice=(start,end)=>{maxRead=Math.max(maxRead,end-start);return sliceFile(start,end);};
  const messages=[],self={postMessage:message=>messages.push(message)};
  vm.runInNewContext(source,{self,Uint8Array,ArrayBuffer,DataView,URL,dicomParser:parser,fflate,importScripts(){}},{filename:fileURLToPath(workerURL),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
  await self.onmessage({data:{type:'scan',slot:'a',files:[file]}});
  const groups=messages.find(m=>m.type==='groups');
  assert.equal(groups?.groups.length,1);
  assert.ok(maxRead<file.size);
  await self.onmessage({data:{type:'build',key:groups.groups[0].key}});
  assert.equal(messages.find(m=>m.type==='error'),undefined,JSON.stringify(messages.find(m=>m.type==='error')));
  assert.equal(messages.find(m=>m.type==='volume').volume.data[0],77.5);
});
