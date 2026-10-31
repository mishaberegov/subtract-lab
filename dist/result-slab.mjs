// Average the already-computed signed difference along the displayed plane normal.
// Never synthesize a value where the central difference has no A/B overlap.
export function averageResultSlab(voxel,axis,dims,count,readDifference){
  if(![1,3,5].includes(count))throw RangeError('Expected 1, 3 or 5 slices');
  if(voxel.some((v,i)=>v<0||v>=dims[i]))return NaN;
  const center=readDifference(voxel);
  if(!Number.isFinite(center)||count===1)return center;
  let sum=center,valid=1;
  const neighbor=[...voxel],radius=(count-1)/2;
  for(let offset=-radius;offset<=radius;offset++){
    if(offset===0)continue;
    const section=voxel[axis]+offset;
    if(section<0||section>=dims[axis])continue;
    neighbor[axis]=section;
    const value=readDifference(neighbor);
    if(Number.isFinite(value)){sum+=value;valid++;}
  }
  return sum/valid;
}
