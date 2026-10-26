importScripts('./vendor/dicomParser.min.js','./vendor/fflate.js');
let groups=[],slot='',busy=false;
const codecs={};
async function codec(type){
  if(codecs[type])return codecs[type];
  const config={charls:['charlswasm_decode','CharLSWASM','JpegLSDecoder'],openjpeg:['openjpegwasm_decode','OpenJPEGWASM','J2KDecoder'],jpeg:['libjpegturbowasm_decode','libjpegturbowasm_decode','JPEGDecoder']}[type];
  importScripts('./vendor/'+config[0]+'.js');
  const module=await self[config[1]]({locateFile:name=>new URL('./vendor/'+name,self.location.href).href});
  codecs[type]=new module[config[2]]();return codecs[type];
}
self.onmessage=async({data})=>{
  const {parseFile,groupParsed,describeGroup,buildVolume}=await import('./dicom.mjs?v=1.1.0');
  if(busy)return;busy=true;
  try{
    if(data.type==='scan'){
      groups=[];slot=data.slot;let entries=[],parsed=[],errors=[],skipped=0,total=0;
      for(const file of data.files){
        total+=file.size;if(total>1.5e9)throw Error('Суммарный размер файлов больше 1.5 ГБ. Выбери одну серию.');
        if(/\.zip$/i.test(file.name)){
          // Stream compressed input in small pieces: unzipSync allocates all outputs before checking limits.
          // ZIP size fields are only hints; enforce both budgets again on actual emitted bytes.
          let failure;
          const unzip=new fflate.Unzip(entry=>{
            if(failure||entry.name.endsWith('/')||entry.name.includes('__MACOSX')||/\.(jpg|png|pdf|txt|xml|html|exe|dll)$/i.test(entry.name))return;
            if(entry.originalSize>600e6){failure=Error('Слишком большой файл внутри ZIP.');return;}
            if(entry.originalSize>2e9-total){failure=Error('Распакованный ZIP слишком большой.');return;}
            const chunks=[];let length=0;
            entry.ondata=(err,chunk,final)=>{
              if(failure)return;
              if(err){failure=err;return;}
              if(chunk.length>600e6-length){failure=Error('Слишком большой файл внутри ZIP.');return;}
              if(chunk.length>2e9-total){failure=Error('Распакованный ZIP слишком большой.');return;}
              length+=chunk.length;total+=chunk.length;
              if(chunk.length)chunks.push(chunk);
              if(final){
                const bytes=new Uint8Array(length);let offset=0;
                for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
                entries.push({name:entry.name,bytes});
              }
            };
            entry.start();
          });
          unzip.register(fflate.UnzipInflate);
          // A tiny compressed push bounds fflate's transient inflate buffer even if size fields lie.
          for(let offset=0;offset<file.size;offset+=65536){
            const input=new Uint8Array(await file.slice(offset,Math.min(offset+65536,file.size)).arrayBuffer());
            for(let i=0;i<input.length;i+=1024){
              unzip.push(input.subarray(i,i+1024),offset+i+1024>=file.size);
              if(failure)throw failure;
            }
          }
        }else entries.push(file);
      }
      for(let i=0;i<entries.length;i++){
        const file=entries[i];
        // File/Blob.bytes is a method in modern browsers; only ZIP entries hold bytes here.
        try{const bytes=file.bytes instanceof Uint8Array?file.bytes:new Uint8Array(await file.arrayBuffer());const p=parseFile(bytes,file.name);if(p)parsed.push(p);else skipped++;}
        catch(e){if(errors.length<5)errors.push(file.name+': '+(e.message||e));skipped++;}
        if(i%5===0)self.postMessage({type:'progress',slot,text:'Чтение DICOM',fraction:(i+1)/entries.length});
      }
      groups=groupParsed(parsed);
      if(!groups.length)throw Error('Не найдена подходящая DICOM-серия. '+(errors[0]||'Выбери папку с DICOM-файлами или ZIP.'));
      self.postMessage({type:'groups',slot,groups:groups.map(describeGroup),skipped,errors});
    }else if(data.type==='build'){
      const group=groups.find(g=>g.key===data.key);if(!group)throw Error('Серия не найдена. Выбери файлы повторно.');
      const volume=await buildVolume(group,{codec,onProgress:f=>self.postMessage({type:'progress',slot,text:'Сборка объёма',fraction:f})});
      self.postMessage({type:'volume',slot,volume},[volume.data.buffer]);groups=[];
    }
  }catch(e){self.postMessage({type:'error',slot,message:e.message||String(e)});}finally{busy=false;}
};
