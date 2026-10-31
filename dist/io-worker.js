importScripts('./vendor/dicomParser.min.js','./vendor/fflate.js');
let groups=[],slot='',busy=false,zipIndices=new Map();
const codecs={};
function sameZipEntries(a,b){
  return a.length===b.length&&a.every((entry,i)=>['name','method','flags','crc','compressed','original','localOffset'].every(key=>entry[key]===b[i][key]));
}
async function previewFile(file,parseFile){
  let length=Math.min(file.size,65536);
  while(length){
    try{return parseFile(new Uint8Array(await file.slice(0,length).arrayBuffer()),file.name,undefined,true);}
    catch(e){if(length===file.size)throw e;length=Math.min(file.size,length*2);}
  }
  return null;
}
async function readZip(file,handler,budget={total:0}){
  let failure,entryIndex=0;
  const unzip=new fflate.Unzip(entry=>{
    const index=entryIndex++;
    if(failure||entry.name.endsWith('/')||entry.name.includes('__MACOSX')||/\.(jpg|png|pdf|txt|xml|html|exe|dll)$/i.test(entry.name))return;
    if(entry.originalSize>600e6){failure=Error('Слишком большой файл внутри ZIP.');return;}
    if(entry.originalSize>2e9-budget.total){failure=Error('Распакованный ZIP слишком большой.');return;}
    let length=0;const receive=handler(entry.name,index);
    entry.ondata=(err,chunk,final)=>{
      if(failure)return;
      if(err){failure=err;return;}
      if(chunk.length>600e6-length){failure=Error('Слишком большой файл внутри ZIP.');return;}
      if(chunk.length>2e9-budget.total){failure=Error('Распакованный ZIP слишком большой.');return;}
      length+=chunk.length;budget.total+=chunk.length;
      try{receive(chunk,final);}catch(e){failure=e;}
    };
    entry.start();
  });
  unzip.register(fflate.UnzipInflate);
  for(let offset=0;offset<file.size;offset+=65536){
    const input=new Uint8Array(await file.slice(offset,Math.min(offset+65536,file.size)).arrayBuffer());
    for(let i=0;i<input.length;i+=1024){
      unzip.push(input.subarray(i,i+1024),offset+i+1024>=file.size);
      if(failure)throw failure;
    }
  }
}
function collectHeader(parseFile,name,done,initial=65536){
  let chunks=[],length=0,nextAttempt=initial,preview=null;
  return (chunk,final)=>{
    if(preview!==null)return true;
    const take=Math.min(chunk.length,64e6-length);
    if(take){chunks.push(chunk.subarray(0,take).slice());length+=take;}
    if(length<nextAttempt&&!final&&length<64e6)return false;
    const bytes=new Uint8Array(length);let offset=0;
    for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
    try{preview=parseFile(bytes,name,undefined,true);}
    catch(e){if(final||length>=64e6){done(null,e);preview=false;return true;}nextAttempt=Math.min(64e6,Math.max(nextAttempt*2,length+1));return false;}
    chunks=[];done(preview,null);if(preview===null)preview=false;return true;
  };
}
async function codec(type){
  if(codecs[type])return codecs[type];
  const config={charls:['charlswasm_decode','CharLSWASM','JpegLSDecoder'],openjpeg:['openjpegwasm_decode','OpenJPEGWASM','J2KDecoder'],jpeg:['libjpegturbowasm_decode','libjpegturbowasm_decode','JPEGDecoder']}[type];
  importScripts('./vendor/'+config[0]+'.js');
  const module=await self[config[1]]({locateFile:name=>new URL('./vendor/'+name,self.location.href).href});
  codecs[type]=new module[config[2]]();return codecs[type];
}
self.onmessage=async({data})=>{
  const {parseFile,groupParsed,describeGroup,buildVolume}=await import('./dicom.mjs?v=1.1.7-date1');
  const {indexZip,readIndexedEntry}=await import('./zip-index.mjs?v=1.1.6-zipcache1');
  if(busy)return;busy=true;
  try{
    if(data.type==='scan'){
      if(data.reuse&&data.files.length===1&&groups.length&&zipIndices.size===1){
        const [[previous,entries]]=zipIndices;
        const file=data.files[0];
        if(file.name===previous.name&&file.size===previous.size&&file.lastModified===previous.lastModified){
          let current;
          try{current=await indexZip(file);}catch{}
          if(current&&sameZipEntries(entries,current)){
            slot=data.slot;
            for(const group of groups)for(const frame of group.frames)if(frame.source.zipFile===previous)frame.source.zipFile=file;
            zipIndices=new Map([[file,current]]);
            self.postMessage({type:'groups',slot,groups:groups.map(describeGroup),skipped:0,errors:[],cachedZip:true,reused:true});
            return;
          }
        }
      }
      groups=[];zipIndices=new Map();slot=data.slot;let parsed=[],errors=[],skipped=0,total=0,declared=0;const budget={total:0};
      const add=(p,source,name,error)=>{
        if(p){p.frames=p.frames.map(f=>({cols:f.cols,rows:f.rows,source}));parsed.push(p);}
        else{skipped++;if(error&&errors.length<5)errors.push(name+': '+(error.message||error));}
      };
      for(let i=0;i<data.files.length;i++){
        const file=data.files[i];
        total+=file.size;if(total>1.5e9)throw Error('Суммарный размер файлов больше 1.5 ГБ. Выбери одну серию.');
        if(/\.zip$/i.test(file.name)){
          let indexed;
          try{indexed=await indexZip(file);}catch(e){if(/каталог|ZIP64|Многотомный/.test(e.message))indexed=null;else throw e;}
          if(indexed){
            zipIndices.set(file,indexed);
            for(const entry of indexed){
              const name=entry.name;
              if(name.endsWith('/')||name.includes('__MACOSX')||/\.(jpg|png|pdf|txt|xml|html|exe|dll)$/i.test(name))continue;
              if(entry.original>600e6)throw Error('Слишком большой файл внутри ZIP.');
              declared+=entry.original;if(declared>2e9)throw Error('Распакованный ZIP слишком большой.');
              const collect=collectHeader(parseFile,name,(p,error)=>add(p,{zipFile:file,entryIndex:entry.index},name,error),4096);
              await readIndexedEntry(file,entry,collect,{budget,prefixOnly:true});
            }
          }else await readZip(file,(name,index)=>collectHeader(parseFile,name,(p,error)=>add(p,{zipFile:file,entryIndex:index},name,error)),budget);
        }else{
          try{add(await previewFile(file,parseFile),file,file.name);}
          catch(e){add(null,file,file.name,e);}
        }
        if(i%25===0||i===data.files.length-1)self.postMessage({type:'progress',slot,text:'Чтение DICOM',fraction:(i+1)/data.files.length});
      }
      groups=groupParsed(parsed);
      if(!groups.length)throw Error('Не найдена подходящая DICOM-серия. '+(errors[0]||'Выбери папку с DICOM-файлами или ZIP.'));
      self.postMessage({type:'groups',slot,groups:groups.map(describeGroup),skipped,errors,cachedZip:data.files.length===1&&zipIndices.size===1,reused:false});
    }else if(data.type==='build'){
      const group=groups.find(g=>g.key===data.key);if(!group)throw Error('Серия не найдена. Выбери файлы повторно.');
      const sources=[...new Set(group.frames.map(f=>f.source))],parsed=[];
      const zipFiles=new Map();
      for(const source of sources){
        if(source.zipFile){if(!zipFiles.has(source.zipFile))zipFiles.set(source.zipFile,new Set());zipFiles.get(source.zipFile).add(source.entryIndex);}
        else parsed.push(parseFile(new Uint8Array(await source.arrayBuffer()),source.name));
      }
      const buildBudget={total:0};
      for(const [zipFile,indices] of zipFiles){
        const indexed=zipIndices.get(zipFile);
        if(indexed){
          for(const entry of indexed){
            if(!indices.has(entry.index))continue;
            const chunks=[];let length=0;
            await readIndexedEntry(zipFile,entry,(chunk)=>{if(chunk.length){chunks.push(chunk.slice());length+=chunk.length;}return false;},{budget:buildBudget});
            const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
            parsed.push(parseFile(bytes,entry.name));
          }
        }else await readZip(zipFile,(name,index)=>{
          if(!indices.has(index))return ()=>{};
          let chunks=[],length=0;
          return (chunk,final)=>{
            if(chunk.length){chunks.push(chunk.slice());length+=chunk.length;}
            if(final){const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}parsed.push(parseFile(bytes,name));chunks=[];}
          };
        },buildBudget);
      }
      if(parsed.length!==sources.length||parsed.some(p=>!p||p.key!==group.key))throw Error('Не удалось повторно прочитать выбранную серию.');
      const selected=groupParsed(parsed)[0];
      const volume=await buildVolume(selected,{codec,onProgress:f=>self.postMessage({type:'progress',slot,text:'Сборка объёма',fraction:f})});
      const {compactCTVolume}=await import('./precision.mjs?v=1.1.2-warnings1');
      compactCTVolume(volume);
      self.postMessage({type:'volume',slot,volume},[volume.data.buffer]);
      if(zipIndices.size!==1){groups=[];zipIndices.clear();}
    }
  }catch(e){self.postMessage({type:'error',slot,message:e.message||String(e)});}finally{busy=false;}
};
