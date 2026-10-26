import {registerRigid} from './core.mjs';
self.onmessage=async({data})=>{
  try{const result=await registerRigid(data.a,data.b,{method:data.method,initial:data.initial,quality:data.quality,onProgress:p=>self.postMessage({type:'progress',...p})});self.postMessage({type:'done',result});}
  catch(e){self.postMessage({type:'error',message:e.message||String(e)});}
};
