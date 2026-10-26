import {resampleToReference} from './resampling.mjs';
self.onmessage=async({data})=>{
  try{
    const volume=await resampleToReference(data.reference,data.moving,data.params,{antiAlias:data.antiAlias,onProgress:p=>self.postMessage({type:'progress',...p})});
    self.postMessage({type:'done',volume},[volume.data.buffer]);
  }catch(error){self.postMessage({type:'error',message:error.message||String(error)});}
};
