import {mm,mv,rotation} from './core.mjs';
import {imageBounds} from './comparison-window.mjs';

// Parameters map A to B, so moving the displayed B requires the opposite sampling shift.
export function dragTranslation(params,start,end,canvas,plane,zoom){
  const bounds=imageBounds(canvas,plane,zoom);
  const du=(end.x-start.x)/bounds.w*plane.w;
  const dv=(end.y-start.y)/bounds.h*plane.h;
  const shift=plane.u.map((x,i)=>x*du+plane.v[i]*dv);
  const delta=mv(rotation(params),shift);
  return params.map((x,i)=>i<3?x-delta[i]:x);
}
export function rotationDragDegrees(start,end,centre){
  const a=Math.atan2(start.y-centre.y,start.x-centre.x);
  const b=Math.atan2(end.y-centre.y,end.x-centre.x);
  let degrees=(b-a)*180/Math.PI;
  if(degrees>180)degrees-=360;
  if(degrees< -180)degrees+=360;
  return degrees;
}

// A positive step rotates the displayed B clockwise (screen coordinates: y down).
// Compose a physical rotation with the existing rigid pose about the reference centre.
export function rotateInPlane(params,plane,degrees){
  const cross=[plane.u[1]*plane.v[2]-plane.u[2]*plane.v[1],plane.u[2]*plane.v[0]-plane.u[0]*plane.v[2],plane.u[0]*plane.v[1]-plane.u[1]*plane.v[0]];
  const length=Math.hypot(...cross),[x,y,z]=cross.map(v=>v/length);
  const angle=-degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),t=1-c;
  const delta=[t*x*x+c,t*x*y-s*z,t*x*z+s*y,t*x*y+s*z,t*y*y+c,t*y*z-s*x,t*x*z-s*y,t*y*z+s*x,t*z*z+c];
  const r=mm(rotation(params),delta);
  const ry=Math.asin(Math.max(-1,Math.min(1,-r[6]))),cy=Math.cos(ry);
  const rx=Math.abs(cy)>1e-8?Math.atan2(r[7],r[8]):Math.atan2(-r[5],r[4]);
  const rz=Math.abs(cy)>1e-8?Math.atan2(r[3],r[0]):0;
  return [...params.slice(0,3),...([rx,ry,rz].map(a=>a*180/Math.PI))];
}
