import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFile} from 'node:fs/promises';
import {parseFile,groupParsed,geometry,buildVolume,decodeFrame} from '../dist/dicom.mjs';import {dicomSlice} from '../scripts/fixtures.mjs';import {Decoder,Utils} from 'jpeg-lossless-decoder-js';
const require=createRequire(import.meta.url),parser=require('dicom-parser');
const group=(options={})=>groupParsed([2,0,1].map(z=>parseFile(dicomSlice({z,...options}),'slice'+z,parser)))[0];
test('DICOM slices sort by physical position, with rescale and anisotropic spacing',async()=>{const g=group({slope:2,intercept:-1000});const v=await buildVolume(g,{parser});assert.deepEqual(v.dims,[5,4,3]);assert.deepEqual(v.matrix,[1.2,0,0,0,1.5,0,0,0,2]);assert.equal(v.data[0],-1000);assert.equal(v.data[20],-960);assert.equal(v.data[40],-920);});
test('Big Endian and signed 12-bit data decode exactly',async()=>{const values=[-2048,-1,0,2047,...Array(16).fill(44)].map(x=>x&4095);for(const little of [true,false]){const v=await buildVolume(group({little,signed:true,bitsStored:12,highBit:11,values}),{parser});assert.deepEqual(Array.from(v.data.slice(0,4)),[-2048,-1,0,2047]);}});
test('padding is masked instead of treated as physical intensity',async()=>{const v=await buildVolume(group({values:Array(20).fill(7).map((v,i)=>i===0?-2000:v),signed:true,padding:-2000}),{parser});assert.ok(Number.isNaN(v.data[0]));assert.equal(v.data[1],7);});
test('one missing slice is interpolated on a physical regular grid while originals remain exact',async()=>{const g=groupParsed([0,1,3].map(z=>parseFile(dicomSlice({z,values:Array(20).fill(10*z)}),'slice'+z,parser)))[0];const v=await buildVolume(g,{parser});assert.deepEqual(v.dims,[5,4,4]);assert.equal(v.matrix[8],2);assert.deepEqual([v.data[0],v.data[20],v.data[40],v.data[60]],[0,10,20,30]);assert.match(v.warnings.join(' '),/Интерполировано срезов: 1/);});
test('DICOM position rounding keeps original slices and does not warn about invented interpolation',async()=>{
  const positions=[0,.60004,1.19995,1.80003];
  const g=groupParsed(positions.map((position,i)=>parseFile(dicomSlice({z:i,origin:[0,0,position],values:Array(20).fill(5+10*i)}),'slice'+i,parser)))[0];
  const v=await buildVolume(g,{parser});
  assert.deepEqual(v.dims,[5,4,4]);
  assert.deepEqual([v.data[0],v.data[20],v.data[40],v.data[60]],[5,15,25,35]);
  assert.doesNotMatch(v.warnings.join(' '),/Интерполировано срезов/);
});
test('meaningful irregular positions still interpolate and warn',async()=>{
  const positions=[0,1.1,2];
  const g=groupParsed(positions.map((position,i)=>parseFile(dicomSlice({z:i,origin:[0,0,position],values:Array(20).fill(i*110)}),'slice'+i,parser)))[0];
  const v=await buildVolume(g,{parser});
  assert.deepEqual(v.dims,[5,4,3]);
  assert.ok(Math.abs(v.data[20]-100)<1e-4);
  assert.match(v.warnings.join(' '),/Интерполировано срезов: 1/);
});
test('irregular physical intervals are resampled without treating noninteger gaps as whole missing slices',async()=>{const g=groupParsed([0,2.3,4].map((z,i)=>parseFile(dicomSlice({z:i,origin:[0,0,z],values:Array(20).fill(z*10)}),'slice'+i,parser)))[0];const v=await buildVolume(g,{parser});assert.deepEqual(v.dims,[5,4,3]);assert.ok(Math.abs(v.matrix[8]-2)<1e-6);assert.ok(Math.abs(v.data[20]-20)<1e-5);assert.equal(v.data[40],40);});
test('duplicates still fail, and a huge discontinuity is not silently fabricated',async()=>{const h=group();h.frames.push(h.frames[0]);assert.throws(()=>geometry(h),/Повторяющиеся|несколько/);const almost=groupParsed([0,0.01,2,4].map((z,i)=>parseFile(dicomSlice({z:i,origin:[0,0,z]}),'slice'+i,parser)))[0];assert.throws(()=>geometry(almost),/Повторяющиеся/);const g=groupParsed([0,1,30].map(z=>parseFile(dicomSlice({z}),'slice'+z,parser)))[0];await assert.rejects(buildVolume(g,{parser}),/слишком большой|разрыв/);});
test('interpolation keeps padding unknown rather than blending it into tissue',async()=>{const g=groupParsed([0,1,3].map(z=>parseFile(dicomSlice({z,signed:true,padding:-2000,values:Array(20).fill(z===1?-2000:100)}),'slice'+z,parser)))[0];const v=await buildVolume(g,{parser});assert.ok(Number.isNaN(v.data[40]));assert.equal(v.data[60],100);});
test('one overlapping boundary between contiguous acquisitions remains one series',async()=>{const specs=[[0,1,10],[1,1,11],[1,2,21],[2,2,22],[3,2,23]];const g=groupParsed(specs.map(([z,acquisition,value],i)=>parseFile(dicomSlice({z,acquisition,values:Array(20).fill(value)}),'slice'+i,parser)))[0];const v=await buildVolume(g,{parser});assert.deepEqual(v.dims,[5,4,4]);assert.deepEqual([v.data[0],v.data[20],v.data[40],v.data[60]],[10,21,22,23]);assert.ok(v.warnings.includes('Две последовательные съёмки перекрываются на одном срезе. Один граничный срез исключён.'));});
test('two overlapping positions between acquisitions are not silently merged',()=>{const specs=[[0,1],[1,1],[2,1],[1,2],[2,2],[3,2]];const g=groupParsed(specs.map(([z,acquisition],i)=>parseFile(dicomSlice({z,acquisition}),'slice'+i,parser)))[0];assert.throws(()=>geometry(g),/Повторяющиеся|перекры/);});
test('different series never merge',()=>{const gs=groupParsed([parseFile(dicomSlice({uid:'2.25.111'}),'a',parser),parseFile(dicomSlice({uid:'2.25.222'}),'b',parser)]);assert.equal(gs.length,2);});
test('series date is carried from the chooser into the loaded volume',async()=>{
  const g=group({studyDate:'20200102',acquisitionDate:'20210304',seriesDate:'20220405'});
  assert.equal(g.date,'2022-04-05');assert.equal(g.dateSource,'series');
  assert.equal(g.frames.length,3);
  assert.equal((await buildVolume(g,{parser})).date,'2022-04-05');
});
test('DICOM dates fall back to acquisition then study without inventing a date',()=>{
  assert.equal(group({acquisitionDateTime:'20230304120000'}).date,'2023-03-04');
  assert.equal(group({studyDate:'20240506'}).dateSource,'study');
  assert.equal(group({studyDate:'20240230'}).date,null);
  assert.equal(group().date,null);
});
test('different dates within a DICOM group are identified as mixed',()=>{
  const g=groupParsed([parseFile(dicomSlice({z:0,seriesDate:'20210101'}),'one',parser),parseFile(dicomSlice({z:1,seriesDate:'20210102'}),'two',parser)])[0];
  assert.equal(g.dateSource,'mixed');assert.equal(g.date,null);
});
test('original SliceThickness is kept separate from slice-to-slice grid spacing',async()=>{const v=await buildVolume(group({sliceThickness:1.5}),{parser});assert.equal(v.sliceThicknessMm,1.5);assert.equal(v.matrix[8],2);});
test('large series is reduced to a usable browser volume without losing slice coverage',async()=>{const v=await buildVolume(group(),{parser,maxVoxels:20});assert.deepEqual(v.dims,[3,2,3]);assert.deepEqual(v.matrix,[2.4,0,0,0,3,0,0,0,2]);assert.equal(v.data[0],3);assert.equal(v.data[12],43);assert.ok(v.warnings.includes('Большой объём: разрешение в плоскости уменьшено в 2 раза (до 3×2×3); исходные срезы по оси Z сохранены.'));});
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
