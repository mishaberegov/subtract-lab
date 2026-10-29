const u16=(view,at)=>view.getUint16(at,true);
const u32=(view,at)=>view.getUint32(at,true);
const number64=(view,at)=>{const value=view.getBigUint64(at,true);if(value>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Слишком большой ZIP.');return Number(value);};
const bytes=async(file,start,end)=>new Uint8Array(await file.slice(start,end).arrayBuffer());

export async function indexZip(file){
  const tailSize=Math.min(file.size,65557),tailStart=file.size-tailSize,tail=await bytes(file,tailStart,file.size),t=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
  let eocd=-1;
  for(let i=tail.length-22;i>=0;i--)if(u32(t,i)===0x06054b50&&i+22+u16(t,i+20)===tail.length){eocd=i;break;}
  if(eocd<0)throw Error('Не найден каталог ZIP.');
  if(u16(t,eocd+4)||u16(t,eocd+6))throw Error('Многотомный ZIP не поддерживается.');
  let count=u16(t,eocd+10),size=u32(t,eocd+12),offset=u32(t,eocd+16);
  if(count===65535||size===0xffffffff||offset===0xffffffff){
    const locator=tailStart+eocd-20;
    if(locator<0)throw Error('Нет каталога ZIP64.');
    const l=await bytes(file,locator,locator+20),ld=new DataView(l.buffer,l.byteOffset,l.byteLength);
    if(l.length!==20||u32(ld,0)!==0x07064b50||u32(ld,4)||u32(ld,16)!==1)throw Error('Некорректный каталог ZIP64.');
    const recordOffset=number64(ld,8),z=await bytes(file,recordOffset,recordOffset+56),zd=new DataView(z.buffer,z.byteOffset,z.byteLength);
    if(z.length!==56||u32(zd,0)!==0x06064b50||u32(zd,16)||u32(zd,20))throw Error('Некорректный каталог ZIP64.');
    count=number64(zd,32);size=number64(zd,40);offset=number64(zd,48);
  }
  if(count>100000||size>64e6||offset+size>file.size)throw Error('Слишком большой или повреждённый каталог ZIP.');
  const central=await bytes(file,offset,offset+size),view=new DataView(central.buffer,central.byteOffset,central.byteLength),entries=[];
  let pos=0;
  for(let index=0;index<count;index++){
    if(pos+46>central.length||u32(view,pos)!==0x02014b50)throw Error('Повреждённый каталог ZIP.');
    const flags=u16(view,pos+8),method=u16(view,pos+10),compressed32=u32(view,pos+20),original32=u32(view,pos+24),nameLength=u16(view,pos+28),extraLength=u16(view,pos+30),commentLength=u16(view,pos+32),offset32=u32(view,pos+42);
    const next=pos+46+nameLength+extraLength+commentLength;
    if(next>central.length||flags&1)throw Error('Зашифрованный или повреждённый ZIP.');
    const rawName=central.subarray(pos+46,pos+46+nameLength),name=new TextDecoder(flags&2048?'utf-8':'latin1').decode(rawName);
    let compressed=compressed32,original=original32,localOffset=offset32;
    if(compressed32===0xffffffff||original32===0xffffffff||offset32===0xffffffff){
      let found=false;
      for(let p=pos+46+nameLength;p+4<=pos+46+nameLength+extraLength;){
        const tag=u16(view,p),length=u16(view,p+2),end=p+4+length;
        if(end>pos+46+nameLength+extraLength)throw Error('Повреждённый ZIP64 extra.');
        if(tag===1){
          let q=p+4;
          for(const field of ['original','compressed','localOffset']){
            if((field==='original'?original32:field==='compressed'?compressed32:offset32)===0xffffffff){
              if(q+8>end)throw Error('Повреждённый ZIP64 extra.');
              const n=number64(view,q);q+=8;
              if(field==='original')original=n;else if(field==='compressed')compressed=n;else localOffset=n;
            }
          }
          found=true;break;
        }
        p=end;
      }
      if(!found)throw Error('Отсутствует ZIP64 extra.');
    }
    entries.push({index,name,method,flags,compressed,original,localOffset});pos=next;
  }
  return entries;
}

export async function readIndexedEntry(file,entry,onChunk,{budget={total:0},prefixOnly=false}={}){
  if(entry.original>600e6||entry.original>2e9-budget.total)throw Error('Слишком большой файл внутри ZIP.');
  if(entry.method!==0&&entry.method!==8)throw Error('Неизвестный метод сжатия ZIP.');
  const header=await bytes(file,entry.localOffset,entry.localOffset+30),v=new DataView(header.buffer,header.byteOffset,header.byteLength);
  if(header.length!==30||u32(v,0)!==0x04034b50||u16(v,8)!==entry.method)throw Error('Повреждённый локальный заголовок ZIP.');
  const localOriginal=u32(v,22);
  if(localOriginal!==0xffffffff&&(localOriginal>600e6||(!(entry.flags&8)&&localOriginal>entry.original)))throw Error('Слишком большой файл внутри ZIP.');
  const start=entry.localOffset+30+u16(v,26)+u16(v,28),end=start+entry.compressed;
  if(end>file.size)throw Error('Обрезанный ZIP.');
  let emitted=0,done=false;
  const emit=(chunk,final)=>{
    if(chunk.length>600e6-emitted||chunk.length>2e9-budget.total)throw Error('Распакованный ZIP слишком большой.');
    emitted+=chunk.length;budget.total+=chunk.length;
    if(onChunk(chunk,final))done=true;
  };
  if(entry.method===0){
    for(let pos=start;pos<end&&!done;pos+=4096){
      const chunk=await bytes(file,pos,Math.min(pos+4096,end));emit(chunk,pos+chunk.length===end);
    }
  }else{
    const inflate=new globalThis.fflate.Inflate((chunk,final)=>emit(chunk,final));
    for(let pos=start;pos<end&&!done;pos+=4096){
      const chunk=await bytes(file,pos,Math.min(pos+4096,end));inflate.push(chunk,pos+chunk.length===end);
    }
  }
  if(!prefixOnly&&emitted!==entry.original)throw Error('Размер файла ZIP не совпадает с каталогом.');
  if(prefixOnly&&!done)emit(new Uint8Array(),true);
  return {emitted,stopped:done};
}
