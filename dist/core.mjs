// Spatial arithmetic uses DICOM patient coordinates (LPS), in millimetres.
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function inverse3(m){
  const [a,b,c,d,e,f,g,h,i]=m;
  const det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
  if(Math.abs(det)<1e-9)throw Error('Некорректная геометрия объёма: вырожденная матрица.');
  return [(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det,(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det,(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det];
}
export function mv(m,p){return [m[0]*p[0]+m[1]*p[1]+m[2]*p[2],m[3]*p[0]+m[4]*p[1]+m[5]*p[2],m[6]*p[0]+m[7]*p[1]+m[8]*p[2]];}
export function mm(a,b){return Array.from({length:9},(_,i)=>{const r=Math.floor(i/3),c=i%3;return a[r*3]*b[c]+a[r*3+1]*b[3+c]+a[r*3+2]*b[6+c];});}
export function world(v,p){const q=mv(v.matrix,p);return q.map((x,i)=>x+v.origin[i]);}
export function center(v){return world(v,v.dims.map(n=>(n-1)/2));}
export function rotation(p){
  const [x,y,z]=p.slice(3).map(v=>v*Math.PI/180),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  return [cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx,sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx,-sy,cy*sx,cy*cx];
}
// Output is fixed-voxel -> moving-voxel. Parameters map fixed LPS -> moving LPS.
export function samplingMap(a,b,p=[0,0,0,0,0,0]){
  const r=rotation(p),ib=inverse3(b.matrix),c=center(a),rc=mv(r,c);
  const t=c.map((x,i)=>x-rc[i]+p[i]-b.origin[i]);
  const o=mv(r,a.origin).map((x,i)=>x+t[i]);
  return {matrix:mm(mm(ib,r),a.matrix),offset:mv(ib,o)};
}
export function mapped(map,x,y,z){return [map.matrix[0]*x+map.matrix[1]*y+map.matrix[2]*z+map.offset[0],map.matrix[3]*x+map.matrix[4]*y+map.matrix[5]*z+map.offset[1],map.matrix[6]*x+map.matrix[7]*y+map.matrix[8]*z+map.offset[2]];}
export function sample(v,x,y,z){
  const [nx,ny,nz]=v.dims;
  if(x<-.00001||y<-.00001||z<-.00001||x>nx-1+.00001||y>ny-1+.00001||z>nz-1+.00001)return NaN;
  x=clamp(x,0,nx-1);y=clamp(y,0,ny-1);z=clamp(z,0,nz-1);
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),jx=Math.min(ix+1,nx-1),jy=Math.min(iy+1,ny-1),jz=Math.min(iz+1,nz-1);
  const ax=x-ix,ay=y-iy,az=z-iz,d=v.data,nxy=nx*ny;
  const p0=iz*nxy+iy*nx,p1=iz*nxy+jy*nx,p2=jz*nxy+iy*nx,p3=jz*nxy+jy*nx;
  const lerp=(a,b,t)=>t===0?a:t===1?b:a*(1-t)+b*t;
  const a=lerp(d[p0+ix],d[p0+jx],ax),b=lerp(d[p1+ix],d[p1+jx],ax),c=lerp(d[p2+ix],d[p2+jx],ax),e=lerp(d[p3+ix],d[p3+jx],ax);
  return lerp(lerp(a,b,ay),lerp(c,e,ay),az);
}
// DICOM LINEAR window, PS3.3 C.11.2.1.2.1 (including the width=1 case).
export function windowValue(x,level,width){
  if(!Number.isFinite(x))return NaN;
  if(width<=1)return x>level-0.5?1:0;
  return clamp((x-(level-0.5))/(width-1)+0.5,0,1);
}
export function difference(a,b,wa,wb){
  if(!Number.isFinite(a)||!Number.isFinite(b))return NaN;
  return windowValue(a,wa.level,wa.width)-windowValue(b,wb.level,wb.width);
}
export function statistics(v){
  const vals=[],stride=Math.max(1,Math.floor(v.data.length/100000));let min=Infinity,max=-Infinity;
  for(let i=0;i<v.data.length;i+=stride){const x=v.data[i];if(Number.isFinite(x)){min=Math.min(x,min);max=Math.max(x,max);vals.push(x);}}
  if(!vals.length)throw Error('Нет конечных значений интенсивности.');
  vals.sort((a,b)=>a-b);
  const lo=vals[Math.floor(vals.length*.01)],hi=vals[Math.floor((vals.length-1)*.995)];
  return {min,max,lo,hi,level:(hi+lo)/2,width:Math.max(1,hi-lo)};
}
export function downsample(v){
  const [nx,ny,nz]=v.dims,dims=v.dims.map(n=>Math.max(1,Math.ceil(n/2))),out=new Float32Array(dims[0]*dims[1]*dims[2]);
  for(let z=0;z<dims[2];z++)for(let y=0;y<dims[1];y++)for(let x=0;x<dims[0];x++){
    let sum=0,n=0;
    for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const xx=2*x+dx,yy=2*y+dy,zz=2*z+dz;
      if(xx>=0&&yy>=0&&zz>=0&&xx<nx&&yy<ny&&zz<nz){const q=v.data[(zz*ny+yy)*nx+xx];if(Number.isFinite(q)){const w=(dx===0?2:1)*(dy===0?2:1)*(dz===0?2:1);sum+=q*w;n+=w;}}
    }
    out[(z*dims[1]+y)*dims[0]+x]=n?sum/n:NaN;
  }
  return {...v,dims,data:out,matrix:v.matrix.map(x=>x*2)};
}
function makeSamples(v,limit,region=null){
  const st=v.stats||statistics(v),points=[],step=Math.max(1,Math.ceil(Math.cbrt(v.data.length/limit))),[nx,ny,nz]=v.dims;
  // Retain tissue and its boundaries, while excluding the air-only background.
  const threshold=st.lo+(st.hi-st.lo)*.025;
  for(let z=0;z<nz;z+=step)for(let y=0;y<ny;y+=step)for(let x=0;x<nx;x+=step){const f=v.data[(z*ny+y)*nx+x];if(Number.isFinite(f)&&f>threshold)points.push([x,y,z,f]);}
  if(points.length<40)throw Error('Недостаточно текстуры или объёма для корегистрации.');
  if(region){
    const selected=points.filter(([x,y,z])=>{
      const q=mapped(region.map,x,y,z);
      return q.every((p,i)=>p>=-region.padding[i]&&p<=region.dims[i]-1+region.padding[i]);
    });
    if(selected.length>=40)return selected;
  }
  return points;
}
function metricFactory(a,b,points,method){
  const stA=a.stats||statistics(a),stB=b.stats||statistics(b),bins=40,ha=new Float64Array(bins),hb=new Float64Array(bins),joint=new Float64Array(bins*bins);
  return p=>{
    const map=samplingMap(a,b,p);let n=0,sa=0,sb=0,saa=0,sbb=0,sab=0;
    if(method==='mi'){ha.fill(0);hb.fill(0);joint.fill(0);}
    for(const [x,y,z,f] of points){const q=mapped(map,x,y,z),g=sample(b,...q);if(!Number.isFinite(g))continue;
      n++;sa+=f;sb+=g;saa+=f*f;sbb+=g*g;sab+=f*g;
      if(method==='mi'){const ia=clamp(Math.floor((f-stA.lo)/Math.max(1e-9,stA.hi-stA.lo)*bins),0,bins-1),ib=clamp(Math.floor((g-stB.lo)/Math.max(1e-9,stB.hi-stB.lo)*bins),0,bins-1);ha[ia]++;hb[ib]++;joint[ia*bins+ib]++;}
    }
    const overlap=n/points.length;
    if(overlap<.35||n<40)return {score:-10,overlap,n};
    const den=Math.sqrt(Math.max(0,(saa-sa*sa/n)*(sbb-sb*sb/n)));
    const ncc=den>1e-9?(sab-sa*sb/n)/den:0;
    let score=ncc;
    if(method==='mi'){
      const entropy=h=>{let e=0;for(const c of h)if(c){const q=c/n;e-=q*Math.log(q);}return e;};
      const h=entropy(joint);score=h>0?(entropy(ha)+entropy(hb))/h-1:0;
    }
    return {score:score-.25*(1-overlap),overlap,n,ncc};
  };
}
export async function registerRigid(a,b,{method='ncc',initial=[0,0,0,0,0,0],onProgress=()=>{},cancelled=()=>false,quality='standard'}={}){
  if(a.dims[2]<3||b.dims[2]<3)throw Error('Для 3D-корегистрации нужно минимум три среза в каждой серии.');
  const started=Date.now(),pa=[a],pb=[b];
  while(Math.max(...pa.at(-1).dims)>64&&Math.min(...pa.at(-1).dims)>6)pa.push(downsample(pa.at(-1)));
  while(Math.max(...pb.at(-1).dims)>64&&Math.min(...pb.at(-1).dims)>6)pb.push(downsample(pb.at(-1)));
  const levels=Math.min(quality==='fine'?4:3,Math.max(pa.length,pb.length));
  // When A includes anatomy beyond B, sample their common field rather than
  // letting A-only slices dominate the overlap penalty and initial search.
  const extent=(v,i)=>v.dims[i]*Math.hypot(v.matrix[i],v.matrix[i+3],v.matrix[i+6]);
  const restrictToMoving=a.dims.some((_,i)=>extent(a,i)>1.4*extent(b,i));
  const region=(av,bv)=>restrictToMoving?{map:samplingMap(av,bv,initial),dims:bv.dims,padding:bv.dims.map((_,i)=>40/Math.hypot(bv.matrix[i],bv.matrix[i+3],bv.matrix[i+6]))}:null;
  let p=[...initial],baseline=null,last=null,evaluations=0;
  for(let level=0;level<levels;level++){
    if(cancelled())throw Error('Корегистрация отменена.');
    const av=pa[Math.max(0,pa.length-1-level)],bv=pb[Math.max(0,pb.length-1-level)],points=makeSamples(av,level===levels-1?18000:9000,region(av,bv)),metric=metricFactory(av,bv,points,method);
    let best=metric(p);evaluations++;
    if(level===0){
      baseline=best;
      const ca=center(a),cb=center(b),centred=[...cb.map((x,i)=>x-ca[i]),0,0,0];
      for(const candidate of [[0,0,0,0,0,0],centred]){const m=metric(candidate);evaluations++;if(m.score>best.score){p=candidate;best=m;}}
    }
    const physical=Math.max(...[0,1,2].map(c=>Math.hypot(av.matrix[c],av.matrix[c+3],av.matrix[c+6])));
    const coarse=[[Math.max(6,physical*2),5],[Math.max(3,physical),2.5],[Math.max(1.5,physical*.5),1.2]];
    const fine=[[1,.6],[.5,.3],[.2,.12]];
    const schedules=level===0?(levels===1?[...coarse,...fine]:coarse):level===levels-1?fine:[[3,2],[1.5,1],[.75,.5]];
    for(let stage=0;stage<schedules.length;stage++){
      const [translation,angle]=schedules[stage];
      for(let pass=0;pass<14;pass++){
        let changed=false;
        for(let axis=0;axis<6;axis++){
          let choice=p,choiceMetric=best;
          for(const sign of [-1,1]){const q=[...p];q[axis]+=sign*(axis<3?translation:angle);if(axis>=3&&Math.abs(q[axis])>45)continue;const m=metric(q);evaluations++;if(m.score>choiceMetric.score+1e-7){choice=q;choiceMetric=m;}}
          if(choice!==p){p=choice;best=choiceMetric;changed=true;}
        }
        onProgress({fraction:(level+(stage+(pass+1)/14)/schedules.length)/levels,level:level+1,levels,score:best.score,overlap:best.overlap,params:p,evaluations});
        await new Promise(r=>setTimeout(r,0));
        if(cancelled())throw Error('Корегистрация отменена.');
        if(!changed)break;
      }
    }
    last=best;
  }
  // Scores before/after are both evaluated at the same final resolution/samples.
  const metric=metricFactory(a,b,makeSamples(a,20000,region(a,b)),method),before=metric(initial),after=metric(p);
  return {params:p,before,after,method,evaluations,elapsedMs:Date.now()-started};
}
export function makeDemo(n=112){
  const dims=[n,n,Math.round(n*.82)],matrix=[1.6,0,0,0,1.6,0,0,0,1.8],origin=[-n*.8,-n*.8,-dims[2]*.9];
  const a={dims,matrix,origin,data:new Float32Array(dims[0]*dims[1]*dims[2]),name:'Фантом · до',modality:'MR',frameUID:'demo',synthetic:true};
  const b={...a,data:new Float32Array(a.data.length),name:'Фантом · после'};
  const known=[5,-3,2,1.5,-1,3],r=rotation(known),ri=inverse3(r),c=center(a);
  const anatomy=(p,lesion)=>{
    const x=p[0]/68,y=p[1]/84,z=p[2]/72,rr=x*x+y*y+z*z;
    if(rr>1.1)return 0;
    if(rr>.98)return 200+16*Math.sin(y*35);
    if(rr>.86)return 45;
    let v=rr>.72?620:830;
    const fold=Math.sin(x*42+Math.sin(y*17)*1.9+Math.cos(z*21))+Math.sin(y*33+z*8)*.55;
    if(rr>.38&&fold>1.05)v=180;
    v+=60*Math.sin(x*14)*Math.cos(y*13)*Math.cos(z*8);
    if(((Math.abs(x)-.12)/.085)**2+(y/.26)**2+(z/.3)**2<1)v=60;
    if((x/.11)**2+((y+.06)/.42)**2+(z/.45)**2<1)v=110;
    if(lesion)v+=330*Math.exp(-((p[0]-26)**2+(p[1]+9)**2+(p[2]-3)**2)/70);
    return v;
  };
  for(let z=0;z<dims[2];z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=(z*n+y)*n+x,p=world(a,[x,y,z]),q=mv(ri,p.map((v,j)=>v-c[j]-known[j])).map((v,j)=>v+c[j]);
    a.data[i]=anatomy(p,false);b.data[i]=anatomy(q,true)*1.23+36;
  }
  a.stats=statistics(a);b.stats=statistics(b);a.window={level:500,width:1000};b.window={level:651,width:1230};
  return {a,b,known};
}
