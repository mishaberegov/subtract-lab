import {samplingMap,sample} from './core.mjs';

export const gridSpacing=v=>[0,1,2].map(i=>Math.hypot(v.matrix[i],v.matrix[i+3],v.matrix[i+6]));

export function resamplingPlan(reference,moving,params=[0,0,0,0,0,0],antiAlias=true){
  const map=samplingMap(reference,moving,params);
  // Match the diagonal footprint variance of the reference voxel, expressed in
  // source-voxel coordinates. This is an anti-alias prefilter, not a scanner PSF model.
  const sigmaVox=[0,1,2].map(i=>{
    const row=map.matrix.slice(3*i,3*i+3),variance=(row.reduce((s,x)=>s+x*x,0)-1)/12;
    const sigma=antiAlias?Math.sqrt(Math.max(0,variance)):0;
    return sigma>=.15&&moving.dims[i]>1?sigma:0;
  });
  return {map,sigmaVox,sourceSpacingMm:gridSpacing(moving),referenceSpacingMm:gridSpacing(reference),sourceSliceThicknessMm:moving.sliceThicknessMm??null,referenceSliceThicknessMm:reference.sliceThicknessMm??null,antiAlias,filterApplied:sigmaVox.some(s=>s>0),interpolation:'trilinear'};
}

async function smooth(volume,sigmas,onProgress){
  const [nx,ny,nz]=volume.dims,n=volume.data.length,axes=sigmas.map((s,i)=>s>0?i:-1).filter(i=>i>=0);
  let data=volume.data;
  for(let pass=0;pass<axes.length;pass++){
    const axis=axes[pass],sigma=sigmas[axis],radius=Math.min(Math.ceil(3*sigma),volume.dims[axis]-1),weights=Array.from({length:radius*2+1},(_,j)=>Math.exp(-.5*((j-radius)/sigma)**2)),out=new Float32Array(n),stride=[1,nx,nx*ny][axis];
    for(let z=0;z<nz;z++){
      for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
        const i=(z*ny+y)*nx+x,position=[x,y,z][axis];
        if(!Number.isFinite(data[i])){out[i]=NaN;continue;}
        let sum=0,total=0;
        for(let k=-radius;k<=radius;k++){
          if(position+k<0||position+k>=volume.dims[axis])continue;
          const value=data[i+k*stride],weight=weights[k+radius];
          if(Number.isFinite(value)){sum+=value*weight;total+=weight;}
        }
        out[i]=total?sum/total:NaN;
      }
      if(z%8===0){onProgress((pass+(z+1)/nz)/axes.length);await new Promise(resolve=>setTimeout(resolve,0));}
    }
    data=out;
  }
  return {...volume,data};
}

export async function resampleToReference(reference,moving,params=[0,0,0,0,0,0],{antiAlias=true,onProgress=()=>{}}={}){
  const plan=resamplingPlan(reference,moving,params,antiAlias),[nx,ny,nz]=reference.dims,n=nx*ny*nz;
  if(!Number.isSafeInteger(n)||n<1||n>100000000)throw Error('Сетка референса слишком большая для браузерного ресэмплинга.');
  const started=Date.now(),source=plan.filterApplied?await smooth(moving,plan.sigmaVox,f=>onProgress({fraction:f*.35,phase:'Сглаживание B'})):moving;
  const out=new Float32Array(n),m=plan.map.matrix,o=plan.map.offset;let valid=0;
  for(let z=0;z<nz;z++){
    for(let y=0;y<ny;y++){
      const bx=m[1]*y+m[2]*z+o[0],by=m[4]*y+m[5]*z+o[1],bz=m[7]*y+m[8]*z+o[2];
      for(let x=0;x<nx;x++){
        const value=sample(source,bx+m[0]*x,by+m[3]*x,bz+m[6]*x);
        out[(z*ny+y)*nx+x]=value;if(Number.isFinite(value))valid++;
      }
    }
    if(z%4===0||z===nz-1){onProgress({fraction:.35+.65*(z+1)/nz,phase:'Ресэмплинг B → A'});await new Promise(resolve=>setTimeout(resolve,0));}
  }
  if(!valid)throw Error('При текущем преобразовании нет перекрытия B с сеткой A. Уточни совмещение.');
  return {dims:[...reference.dims],matrix:[...reference.matrix],origin:[...reference.origin],data:out,frameUID:reference.frameUID||'',name:moving.name+' → A',modality:moving.modality,synthetic:!!moving.synthetic,window:moving.window,resampling:{...plan,validFraction:valid/n,elapsedMs:Date.now()-started,params:[...params]}};
}
