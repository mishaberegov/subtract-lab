import {inverse3,mv,samplingMap} from './core.mjs';
import {planeMapping} from './orientation.mjs';

// The display grid is separate from the resampled B volume and NIfTI export.
// B's eight voxel corners are mapped back into A voxel coordinates.
export function displayExtent(a,b,params,plane){
  const base=planeMapping(a,plane,0),origin=base.voxel(0,0),du=base.voxel(1,0).map((x,i)=>x-origin[i]),dv=base.voxel(0,1).map((x,i)=>x-origin[i]);
  const limits=[[0,base.w-1],[0,base.h-1],[0,a.dims[base.normalAxis]-1]];
  if(b){
    const map=samplingMap(a,b,params),inverse=inverse3(map.matrix);
    for(const x of [0,b.dims[0]-1])for(const y of [0,b.dims[1]-1])for(const z of [0,b.dims[2]-1]){
      const p=mv(inverse,[x-map.offset[0],y-map.offset[1],z-map.offset[2]]),d=p.map((v,i)=>v-origin[i]),q=[du.reduce((s,v,i)=>s+v*d[i],0),dv.reduce((s,v,i)=>s+v*d[i],0),p[base.normalAxis]];
      for(let i=0;i<3;i++){limits[i][0]=Math.min(limits[i][0],q[i]);limits[i][1]=Math.max(limits[i][1],q[i]);}
    }
  }
  const rounded=limits.map(([lo,hi])=>[Math.floor(lo+1e-5),Math.ceil(hi-1e-5)]);
  const [u,v,n]=rounded,w=u[1]-u[0]+1,h=v[1]-v[0]+1;
  // Do not allocate multi-megapixel canvases for corrupt or unrelated coordinates.
  if(w>2048||h>2048||n[1]-n[0]+1>4096)return {min:0,max:a.dims[base.normalAxis]-1,umin:0,vmin:0,w:base.w,h:base.h,limited:true};
  return {min:n[0],max:n[1],umin:u[0],vmin:v[0],w,h,limited:false};
}
export function displayPlane(a,plane,slice,extent){
  const base=planeMapping(a,plane,slice);
  return {...base,w:extent.w,h:extent.h,voxel:(u,v)=>base.voxel(u+extent.umin,v+extent.vmin)};
}
