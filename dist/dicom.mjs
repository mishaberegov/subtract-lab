import {cross,dot,statistics} from './core.mjs';
const nums=(ds,tag)=>{const s=ds?.string(tag);return s?s.split('\\').map(Number):null;};
const seq=(ds,tag,index=0)=>ds?.elements[tag]?.items?.[index]?.dataSet;
const scalar=(ds,tag,fallback)=>{const x=nums(ds,tag)?.[0];return Number.isFinite(x)?x:fallback;};
const nested=(frame,shared,tag)=>seq(frame,tag)||seq(shared,tag);
export function inflateDicomDataset(data,pos,limit=500e6){
  if(pos>limit)throw Error('Deflated DICOM превышает лимит распакованного размера.');
  const chunks=[];let size=pos;
  const decoder=new globalThis.fflate.Inflate(chunk=>{
    size+=chunk.length;
    if(size>limit)throw Error('Deflated DICOM превышает лимит распакованного размера.');
    chunks.push(chunk);
  });
  for(let i=pos;i<data.length;i+=1024)decoder.push(data.subarray(i,Math.min(i+1024,data.length)),i+1024>=data.length);
  const out=new Uint8Array(size);out.set(data.subarray(0,pos));
  let cursor=pos;for(const chunk of chunks){out.set(chunk,cursor);cursor+=chunk.length;}
  return out;
}
export function parseFile(bytes,name,parser=globalThis.dicomParser){
  const ds=parser.parseDicom(bytes,{inflater:inflateDicomDataset});
  if(!ds.elements.x7fe00010&&!ds.elements.x7fe00008&&!ds.elements.x7fe00009)return null;
  if((ds.string('x00080008')||'').includes('MOSAIC'))throw Error('Siemens MOSAIC нужно экспортировать отдельными срезами или Enhanced DICOM.');
  if(ds.elements.x00283000)throw Error('Modality LUT пока не поддерживается. Нужен экспорт с Rescale Slope/Intercept.');
  const rows=ds.uint16('x00280010'),cols=ds.uint16('x00280011'),count=parseInt(ds.string('x00280008')||'1',10);
  if(!rows||!cols||!count||count<1||count>10000||rows*cols*count>180000000)throw Error('Слишком большой или некорректный DICOM-объём.');
  if((ds.uint16('x00280002')||1)!==1||!/^MONOCHROME[12]$/.test(ds.string('x00280004')||''))throw Error('Поддерживаются только монохромные КТ/МР/ПЭТ-изображения.');
  if(ds.string('x00280004')==='MONOCHROME1')throw Error('MONOCHROME1 требует инверсии шкалы; экспортируй серию как MONOCHROME2.');
  const shared=seq(ds,'x52009229'),frames=[];
  for(let i=0;i<count;i++){
    const f=seq(ds,'x52009230',i),position=nested(f,shared,'x00209113'),orientation=nested(f,shared,'x00209116'),measures=nested(f,shared,'x00289110'),rescale=nested(f,shared,'x00289145');
    let ipp=nums(position,'x00200032')||nums(ds,'x00200032'),iop=nums(orientation,'x00200037')||nums(ds,'x00200037'),spacing=nums(measures,'x00280030')||nums(ds,'x00280030');
    // Classic multi-frame without per-frame positions is ambiguous: do not invent geometry.
    if(count>1&&!position)throw Error('В multiframe-файле нет координат каждого кадра (Enhanced DICOM). Нужен экспорт отдельными срезами.');
    if(!ipp||ipp.length!==3||!iop||iop.length!==6||!spacing||spacing.length!==2||[...ipp,...iop,...spacing].some(x=>!Number.isFinite(x))||spacing.some(x=>x<=0))throw Error('Нет корректных ImagePositionPatient / ImageOrientationPatient / PixelSpacing.');
    const u=iop.slice(0,3),v=iop.slice(3),norm=cross(u,v);
    if(Math.abs(dot(u,u)-1)>.005||Math.abs(dot(v,v)-1)>.005||Math.abs(dot(u,v))>.005)throw Error('Некорректные косинусы ориентации DICOM.');
    frames.push({ds,index:i,name,rows,cols,ipp,iop,spacing,norm,acquisition:ds.string('x00200012')||'',
      slope:scalar(rescale,'x00281053',scalar(ds,'x00281053',1)),intercept:scalar(rescale,'x00281052',scalar(ds,'x00281052',0)),
      sliceThicknessMm:scalar(measures,'x00180050',scalar(ds,'x00180050',null)),
      thickness:scalar(measures,'x00180088',scalar(ds,'x00180088',scalar(measures,'x00180050',scalar(ds,'x00180050',1))))});
  }
  const uid=ds.string('x0020000e');if(!uid)throw Error('Нет SeriesInstanceUID.');
  const key=[uid,ds.string('x00180086')||'',ds.string('x00200100')||'',ds.string('x00080008')||''].join('|');
  return {key,frames,name:ds.string('x0008103e')||ds.string('x00181030')||'DICOM-серия',modality:ds.string('x00080060')||'DICOM',series:ds.string('x00200011')||'',echo:ds.string('x00180086')||'',frameUID:ds.string('x00200052')||'',ts:ds.string('x00020010')||'1.2.840.10008.1.2'};
}
export function groupParsed(parsed){
  const groups=new Map();
  for(const item of parsed.filter(Boolean)){if(groups.has(item.key))groups.get(item.key).frames.push(...item.frames);else groups.set(item.key,{...item,frames:[...item.frames]});}
  return [...groups.values()].sort((a,b)=>b.frames.length-a.frames.length);
}
export function describeGroup(g){return {key:g.key,name:g.name,modality:g.modality,series:g.series,echo:g.echo,frames:g.frames.length,dims:[g.frames[0].cols,g.frames[0].rows,g.frames.length],ts:g.ts};}
export function geometry(g){
  const frames=[...g.frames],first=frames[0],normal=first.norm;frames.sort((a,b)=>dot(a.ipp,normal)-dot(b.ipp,normal));
  let seamRemoved=0;
  const duplicate=[];
  for(let i=1;i<frames.length;i++)if(Math.abs(dot(frames[i].ipp,normal)-dot(frames[i-1].ipp,normal))<.001)duplicate.push(i);
  if(duplicate.length===1){
    const i=duplicate[0],a=frames[i-1],b=frames[i],acquisitions=new Map();
    for(const frame of frames){const list=acquisitions.get(frame.acquisition)||[];list.push(dot(frame.ipp,normal));acquisitions.set(frame.acquisition,list);}
    const left=acquisitions.get(a.acquisition),right=acquisitions.get(b.acquisition),at=dot(a.ipp,normal);
    const bounds=(points)=>points.reduce(([min,max],p)=>[Math.min(min,p),Math.max(max,p)],[Infinity,-Infinity]);
    const [leftMin,leftMax]=bounds(left||[]),[rightMin,rightMax]=bounds(right||[]);
    const adjacent=(Math.abs(leftMax-at)<.001&&Math.abs(rightMin-at)<.001)
      ||(Math.abs(rightMax-at)<.001&&Math.abs(leftMin-at)<.001);
    // A single shared endpoint from two otherwise disjoint acquisitions is a
    // seam, not two simultaneous images to blend. Keep the larger block's edge.
    if(a.acquisition&&b.acquisition&&a.acquisition!==b.acquisition&&acquisitions.size===2&&left.length>1&&right.length>1&&adjacent
      &&frames.every(q=>q.ds.string('x00200052')===a.ds.string('x00200052')&&q.ds.string('x0020000d')===a.ds.string('x0020000d'))){
      frames.splice(left.length>right.length?i:i-1,1);seamRemoved=1;
    }
  }
  const f=frames[0],n=frames.length,[rows,cols]=[f.rows,f.cols],u=f.iop.slice(0,3),v=f.iop.slice(3);
  for(const q of frames){if(q.rows!==rows||q.cols!==cols||q.iop.some((x,i)=>Math.abs(x-f.iop[i])>.002)||q.spacing.some((x,i)=>Math.abs(x-f.spacing[i])>.005))throw Error('В одной серии смешаны разные размеры, ориентации или PixelSpacing. Выбери одну реконструкцию.');}
  let dz=f.norm.map(x=>x*Math.abs(f.thickness||1)),positions=[0],outputCount=n;
  if(n>1){
    positions=frames.map(q=>dot(q.ipp.map((x,j)=>x-f.ipp[j]),normal));
    const gaps=positions.slice(1).map((p,i)=>p-positions[i]);
    if(gaps.some(distance=>distance<.001))throw Error('Повторяющиеся позиции срезов: смешаны фазы/эхо либо дубликаты файлов.');
    const sorted=[...gaps].sort((a,b)=>a-b),middle=sorted[Math.floor(sorted.length/2)];
    if(sorted[0]<.5&&sorted[0]<middle*.2)throw Error('Повторяющиеся позиции срезов: смешаны фазы/эхо либо дубликаты файлов.');
    const nominal=sorted[0],extent=positions[n-1];
    // The shortest observed interval anchors the nominal step. With only two
    // slices there is no evidence of a missing intermediate slice.
    outputCount=Math.max(n,Math.round(extent/nominal)+1);
    if(outputCount>10000||Math.max(...gaps)>nominal*13)throw Error('Слишком большой разрыв между срезами: интерполяция ненадёжна.');
    dz=f.ipp.map((x,i)=>(frames[n-1].ipp[i]-x)/(outputCount-1));
    const step=extent/(outputCount-1);
    for(let i=1;i<n;i++){
      // Do not quietly treat arbitrary in-plane motion as pure through-plane
      // displacement. Interpolation below assumes corresponding pixels align.
      const fraction=positions[i]/extent;
      const transverse=frames[i].ipp.map((x,j)=>x-f.ipp[j]-fraction*(frames[n-1].ipp[j]-f.ipp[j]));
      if(Math.hypot(...transverse)>Math.max(.1,step*.03))throw Error('Позиции срезов смещены в плоскости; без пространственного пересчёта интерполяция ненадёжна.');
    }
  }
  const matrix=[u[0]*f.spacing[1],v[0]*f.spacing[0],dz[0],u[1]*f.spacing[1],v[1]*f.spacing[0],dz[1],u[2]*f.spacing[1],v[2]*f.spacing[0],dz[2]];
  return {frames,matrix,origin:f.ipp,dims:[cols,rows,outputCount],positions,seamRemoved};
}
function rleDecode(bytes,rows,cols,bits){
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),segments=dv.getUint32(0,true),n=rows*cols,bpp=bits/8;
  if(segments!==bpp||bytes.length<64)throw Error('Некорректный монохромный RLE.');
  const out=new Uint8Array(n*bpp);
  for(let s=0;s<segments;s++){
    let pos=dv.getUint32(4+4*s,true),end=s+1<segments?dv.getUint32(8+4*s,true):bytes.length,k=0;
    while(pos<end&&k<n){const h=(bytes[pos++]<<24)>>24;if(h>=0){for(let j=0;j<=h;j++){if(pos>=end||k>=n)throw Error('Повреждённый RLE.');out[k++*bpp+(bpp-1-s)]=bytes[pos++];}}else if(h>-128){if(pos>=end)throw Error('Повреждённый RLE.');const c=bytes[pos++];for(let j=0;j<1-h;j++){if(k>=n)throw Error('Повреждённый RLE.');out[k++*bpp+(bpp-1-s)]=c;}}}
    if(k!==n)throw Error('Неполный RLE-кадр.');
  }
  return out;
}
function encapsulated(ds,index,count,parser){
  const e=ds.elements.x7fe00010;
  if(e.basicOffsetTable?.length)return parser.readEncapsulatedImageFrame(ds,e,index);
  if(count===1)return parser.readEncapsulatedPixelDataFromFragments(ds,e,0,e.fragments.length);
  if(e.fragments.length===count)return parser.readEncapsulatedPixelDataFromFragments(ds,e,index,1);
  throw Error('Multiframe со сжатием и неоднозначной таблицей фрагментов. Экспортируй отдельные DICOM-срезы.');
}
export async function decodeFrame(f,{parser=globalThis.dicomParser,codec,lossless}={}){
  const ds=f.ds,n=f.rows*f.cols,ts=ds.string('x00020010')||'1.2.840.10008.1.2',bits=ds.uint16('x00280100')||16,stored=ds.uint16('x00280101')||bits,high=ds.uint16('x00280102')??stored-1,signed=ds.uint16('x00280103')===1;
  const floating=!!ds.elements.x7fe00008||!!ds.elements.x7fe00009;
  if(!floating&&![8,16,32].includes(bits))throw Error('Поддерживаются 8-, 16- и 32-битные монохромные пиксели.');
  if(!floating&&(stored>bits||stored<1||high>=bits||high+1<stored))throw Error('Некорректные BitsStored / HighBit.');
  let bytes,little=ts!=='1.2.840.10008.1.2.2',floatBits=ds.elements.x7fe00009?64:32;
  if(['1.2.840.10008.1.2','1.2.840.10008.1.2.1','1.2.840.10008.1.2.2','1.2.840.10008.1.2.1.99'].includes(ts)){
    const e=ds.elements.x7fe00010||ds.elements.x7fe00008||ds.elements.x7fe00009,bpp=(floating?floatBits:bits)/8,offset=e.dataOffset+f.index*n*bpp;
    if(offset+n*bpp>ds.byteArray.length||e.length<n*bpp*(f.index+1))throw Error('Размер PixelData не соответствует кадрам.');
    bytes=ds.byteArray.subarray(offset,offset+n*bpp);
  }else{
    const compressed=encapsulated(ds,f.index,parseInt(ds.string('x00280008')||'1',10),parser);
    if(ts==='1.2.840.10008.1.2.5')bytes=rleDecode(compressed,f.rows,f.cols,bits);
    else if(['1.2.840.10008.1.2.4.57','1.2.840.10008.1.2.4.70'].includes(ts)){
      const Decoder=lossless||(await import('./vendor/lossless-min.js')).Decoder,decoder=new Decoder();
      const result=decoder.decode(compressed.buffer,compressed.byteOffset,compressed.byteLength,bits/8);
      bytes=new Uint8Array(result.buffer,result.byteOffset,result.byteLength);
    }else if(['1.2.840.10008.1.2.4.80','1.2.840.10008.1.2.4.81','1.2.840.10008.1.2.4.90','1.2.840.10008.1.2.4.91','1.2.840.10008.1.2.4.50'].includes(ts)){
      if(!codec)throw Error('Не удалось загрузить декодер сжатых DICOM.');
      const type=ts.endsWith('.80')||ts.endsWith('.81')?'charls':ts.endsWith('.50')?'jpeg':'openjpeg',decoder=await codec(type);
      decoder.getEncodedBuffer(compressed.length).set(compressed);decoder.decode();
      const info=decoder.getFrameInfo();
      if(info.width!==f.cols||info.height!==f.rows||info.componentCount!==1)throw Error('Размеры сжатого кадра не совпадают с DICOM.');
      bytes=decoder.getDecodedBuffer().slice();
    }else throw Error('Transfer Syntax '+ts+' пока не поддерживается. Экспортируй DICOM без сжатия.');
    little=true;
  }
  if(bytes.length!==n*(floating?floatBits:bits)/8)throw Error('Длина декодированного кадра не совпадает с Rows × Columns.');
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),out=new Float32Array(n),shift=high+1-stored,mod=2**stored,sign=mod/2;
  const paddingTag=floating?(floatBits===64?'x00280123':'x00280122'):'x00280120',rangeTag=floating?(floatBits===64?'x00280125':'x00280124'):'x00280121';
  const readPadding=tag=>{const e=ds.elements[tag];if(!e)return null;if(floating){const pd=new DataView(ds.byteArray.buffer,ds.byteArray.byteOffset+e.dataOffset,e.length);return floatBits===64?pd.getFloat64(0,little):pd.getFloat32(0,little);}return signed?ds.int16(tag):ds.uint16(tag);};
  const padding=readPadding(paddingTag),paddingEnd=readPadding(rangeTag)??padding;
  for(let i=0;i<n;i++){
    let value;
    if(floating)value=floatBits===64?dv.getFloat64(i*8,little):dv.getFloat32(i*4,little);
    else {value=bits===8?dv.getUint8(i):bits===16?dv.getUint16(i*2,little):dv.getUint32(i*4,little);value=Math.floor(value/2**shift)%mod;if(signed&&value>=sign)value-=mod;}
    out[i]=padding!==null&&value>=Math.min(padding,paddingEnd)&&value<=Math.max(padding,paddingEnd)?NaN:value*f.slope+f.intercept;
  }
  return out;
}
export async function buildVolume(g,{onProgress=()=>{},...options}={}){
  const geo=geometry(g),[width,height,depth]=geo.dims,budget=options.maxVoxels??60000000;
  if(!Number.isSafeInteger(budget)||budget<1)throw Error('Некорректный лимит объёма.');
  let factor=1;
  while(Math.ceil(width/factor)*Math.ceil(height/factor)*depth>budget&&factor<Math.max(width,height))factor++;
  const dims=[Math.ceil(width/factor),Math.ceil(height/factor),depth],n=dims.reduce((a,b)=>a*b,1);
  if(n>budget)throw Error('Объём слишком большой даже после уменьшения плоскости среза.');
  const matrix=geo.matrix.map((v,i)=>i%3===2?v:v*factor),origin=geo.origin.map((v,i)=>v+(factor-1)*(geo.matrix[i*3]+geo.matrix[i*3+1])/2);
  const stride=dims[0]*dims[1],data=new Float32Array(n);
  const reduceFrame=(pixels)=>{
    if(factor===1)return pixels;
    const reduced=new Float32Array(stride);
    for(let y=0;y<dims[1];y++)for(let x=0;x<dims[0];x++){
      let sum=0,count=0;
      for(let yy=y*factor;yy<Math.min((y+1)*factor,height);yy++)for(let xx=x*factor;xx<Math.min((x+1)*factor,width);xx++){
        const value=pixels[yy*width+xx];if(Number.isFinite(value)){sum+=value;count++;}
      }
      reduced[y*dims[0]+x]=count?sum/count:NaN;
    }
    return reduced;
  };
  let interpolated=0,z=0,previous=reduceFrame(await decodeFrame(geo.frames[0],options));
  data.set(previous);z++;onProgress(1/geo.frames.length);
  for(let i=1;i<geo.frames.length;i++){
    const current=reduceFrame(await decodeFrame(geo.frames[i],options)),a=geo.positions[i-1],b=geo.positions[i];
    while(z<geo.dims[2]){
      const position=geo.positions.at(-1)*z/(geo.dims[2]-1);
      if(position>b+1e-5)break;
      if(Math.abs(position-b)<1e-5){data.set(current,z*stride);z++;continue;}
      const fraction=(position-a)/(b-a);interpolated++;
      for(let p=0;p<stride;p++){
        const x=previous[p],y=current[p];
        data[z*stride+p]=Number.isFinite(x)&&Number.isFinite(y)?x+(y-x)*fraction:NaN;
      }
      z++;
    }
    previous=current;onProgress((i+1)/geo.frames.length);
  }
  const v={dims,matrix,origin,data,name:g.name,modality:g.modality,frameUID:g.frameUID,ts:g.ts,synthetic:false,sliceThicknessMm:geo.frames[0].sliceThicknessMm};
  v.stats=statistics(v);
  const ds=geo.frames[0].ds,wl=scalar(ds,'x00281050',NaN),ww=scalar(ds,'x00281051',NaN);
  v.window=Number.isFinite(wl)&&ww>=1?{level:wl,width:ww}:{level:v.stats.level,width:v.stats.width};
  v.warnings=[];
  if(geo.seamRemoved)v.warnings.push('Две последовательные съёмки перекрываются на одном срезе. Один граничный срез исключён; проверь стык перед количественным анализом.');
  if(factor>1)v.warnings.push(`Большой объём: разрешение в плоскости уменьшено в ${factor} раза усреднением (до ${dims.join('×')}); исходные срезы по оси Z сохранены.`);
  if(interpolated)v.warnings.push(`Интерполировано срезов: ${interpolated}. Интерполяция не восстанавливает отсутствующие детали; проверь результат перед количественным анализом.`);
  if(!g.frameUID)v.warnings.push('В DICOM нет FrameOfReferenceUID: исходное совпадение координат не гарантировано.');
  if(['1.2.840.10008.1.2.4.50','1.2.840.10008.1.2.4.81','1.2.840.10008.1.2.4.91'].includes(g.ts))v.warnings.push('Серия использует сжатие с возможной потерей данных.');
  return v;
}
