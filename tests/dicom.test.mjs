import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFile} from 'node:fs/promises';
import {parseFile,groupParsed,geometry,buildVolume,decodeFrame} from '../dist/dicom.mjs';import {dicomSlice} from '../scripts/fixtures.mjs';import {Decoder,Utils} from 'jpeg-lossless-decoder-js';
const require=createRequire(import.meta.url),parser=require('dicom-parser');
const group=(options={})=>groupParsed([2,0,1].map(z=>parseFile(dicomSlice({z,...options}),'slice'+z,parser)))[0];
test('DICOM slices sort by physical position, with rescale and anisotropic spacing',async()=>{const g=group({slope:2,intercept:-1000});const v=await buildVolume(g,{parser});assert.deepEqual(v.dims,[5,4,3]);assert.deepEqual(v.matrix,[1.2,0,0,0,1.5,0,0,0,2]);assert.equal(v.data[0],-1000);assert.equal(v.data[20],-960);assert.equal(v.data[40],-920);});
test('Big Endian and signed 12-bit data decode exactly',async()=>{const values=[-2048,-1,0,2047,...Array(16).fill(44)].map(x=>x&4095);for(const little of [true,false]){const v=await buildVolume(group({little,signed:true,bitsStored:12,highBit:11,values}),{parser});assert.deepEqual(Array.from(v.data.slice(0,4)),[-2048,-1,0,2047]);}});
test('padding is masked instead of treated as physical intensity',async()=>{const v=await buildVolume(group({values:Array(20).fill(7).map((v,i)=>i===0?-2000:v),signed:true,padding:-2000}),{parser});assert.ok(Number.isNaN(v.data[0]));assert.equal(v.data[1],7);});
test('missing and duplicate slices fail instead of inventing a 3D geometry',()=>{const g=group();g.frames[1].ipp[2]=1;assert.throws(()=>geometry(g),/Неравномерный/);const h=group();h.frames.push(h.frames[0]);assert.throws(()=>geometry(h),/Повторяющиеся|Неравномерный|несколько/);});
test('different series never merge',()=>{const gs=groupParsed([parseFile(dicomSlice({uid:'2.25.111'}),'a',parser),parseFile(dicomSlice({uid:'2.25.222'}),'b',parser)]);assert.equal(gs.length,2);});
test('original SliceThickness is kept separate from slice-to-slice grid spacing',async()=>{const v=await buildVolume(group({sliceThickness:1.5}),{parser});assert.equal(v.sliceThicknessMm,1.5);assert.equal(v.matrix[8],2);});
test('RLE DICOM restores 16-bit byte planes',async()=>{
  const n=20,values=Array.from({length:n},(_,i)=>i*257),bytes=new Uint8Array(64+2*(n+1)),dv=new DataView(bytes.buffer);dv.setUint32(0,2,true);dv.setUint32(4,64,true);dv.setUint32(8,85,true);bytes[64]=bytes[85]=n-1;values.forEach((v,i)=>{bytes[65+i]=v>>8;bytes[86+i]=v&255;});
  const g=groupParsed([parseFile(dicomSlice({pixelBytes:bytes,ts:'1.2.840.10008.1.2.5'}),'rle',parser)])[0],v=await buildVolume(g,{parser});assert.deepEqual(Array.from(v.data),values);
});
for(const [type,stem,cls,syntax]of [['charls','charlswasm','JpegLS','1.2.840.10008.1.2.4.80'],['openjpeg','openjpegwasm','J2K','1.2.840.10008.1.2.4.90']])test(type+' compressed DICOM round trip matches original 16-bit intensities',async()=>{
  const base=process.cwd()+'/node_modules/@cornerstonejs/codec-'+type+'/dist/',mod=await require(base+stem+'.js')({wasmBinary:await readFile(base+stem+'.wasm')}),encoder=new mod[cls+'Encoder'](),decoder=new mod[cls+'Decoder'](),width=32,height=32,values=Uint16Array.from({length:width*height},(_,i)=>(i*17)%3000),frameInfo={width,height,bitsPerSample:16,componentCount:1,isSigned:false};
  if(type==='openjpeg'){encoder.setDecompositions(2);encoder.setCompressionRatio(0);}
  encoder.getDecodedBuffer(frameInfo).set(new Uint8Array(values.buffer));encoder.encode();const encoded=encoder.getEncodedBuffer().slice();
  const g=groupParsed([parseFile(dicomSlice({rows:height,cols:width,pixelBytes:encoded,ts:syntax}),'compressed',parser)])[0],v=await buildVolume(g,{parser,codec:async()=>decoder});assert.deepEqual(Array.from(v.data),Array.from(values));encoder.delete();decoder.delete();
});
test('JPEG Lossless DICOM decoding matches the upstream reference checksum',async()=>{
  const bytes=new Uint8Array(await readFile('node_modules/jpeg-lossless-decoder-js/tests/data/jpeg_lossless_sel1.dcm')),ds=parser.parseDicom(bytes),frame={ds,index:0,rows:256,cols:256,slope:1,intercept:0};
  const result=await decodeFrame(frame,{parser,lossless:Decoder}),raw=Uint16Array.from(result,x=>x&65535);assert.equal(Utils.crc32(raw.buffer),3476557349);
});
