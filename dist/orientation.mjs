// Select voxel axes by their physical DICOM LPS direction, not array dimension number.
const labels=['sagittal','coronal','axial'];
function axes(v){return [0,1,2].map(i=>[v.matrix[i],v.matrix[i+3],v.matrix[i+6]]);}
function assignment(v){
  const a=axes(v), permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  return permutations.reduce((best,p)=>{
    const score=p.reduce((sum,index,physical)=>sum+Math.abs(a[index][physical])/Math.hypot(...a[index]),0);
    return score>best.score?{p,score}:best;
  },{p:null,score:-Infinity}).p;
}
export function sourcePlane(v){return labels[assignment(v).indexOf(2)];}
export function planeMapping(v,plane,slice){
  const physical=labels.indexOf(plane);
  if(physical<0)throw Error('Unknown plane: '+plane);
  const a=axes(v),normalAxis=assignment(v)[physical],remaining=[0,1,2].filter(i=>i!==normalAxis);
  const horizontal=plane==='sagittal'?1:0,vertical=plane==='axial'?1:2;
  const hAxis=Math.abs(a[remaining[0]][horizontal])/Math.hypot(...a[remaining[0]])>=Math.abs(a[remaining[1]][horizontal])/Math.hypot(...a[remaining[1]])?remaining[0]:remaining[1];
  const vAxis=remaining.find(i=>i!==hAxis),hSign=a[hAxis][horizontal]<0?-1:1;
  const vSign=a[vAxis][vertical]*(plane==='axial'?1:-1)<0?-1:1;
  const voxel=(x,y)=>{const p=[0,0,0];p[normalAxis]=slice;p[hAxis]=hSign>0?x:v.dims[hAxis]-1-x;p[vAxis]=vSign>0?y:v.dims[vAxis]-1-y;return p;};
  return {normalAxis,w:v.dims[hAxis],h:v.dims[vAxis],sx:Math.hypot(...a[hAxis]),sy:Math.hypot(...a[vAxis]),u:a[hAxis].map(x=>hSign*x),v:a[vAxis].map(x=>vSign*x),voxel};
}
