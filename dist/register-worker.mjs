import {registerRigid} from './core.mjs?v=1.1.1-fov1';
self.onmessage=async({data})=>{
  try{const result=await registerRigid(data.a,data.b,{method:data.method,initial:data.initial,quality:data.quality,onProgress:p=>self.postMessage({type:'progress',...p})});self.postMessage({type:'done',result});}
  catch(e){self.postMessage({type:'error',message:e.message||String(e)});}
};
