// NIfTI-1 stores dimensions as signed 16-bit integers (dim[1..3]).
export function makeNiftiHeader(a){
  if(a.dims.length!==3||a.dims.some(v=>!Number.isInteger(v)||v<1||v>32767))
    throw Error('Размеры NIfTI должны быть целыми числами от 1 до 32767.');
  const header=new ArrayBuffer(352),dv=new DataView(header);
  dv.setInt32(0,348,true);dv.setInt16(40,3,true);
  a.dims.forEach((v,i)=>dv.setInt16(42+2*i,v,true));
  dv.setInt16(70,16,true);dv.setInt16(72,32,true);dv.setFloat32(76,1,true);
  [0,1,2].forEach(i=>dv.setFloat32(80+i*4,Math.hypot(a.matrix[i],a.matrix[i+3],a.matrix[i+6]),true));
  dv.setFloat32(108,352,true);dv.setFloat32(112,1,true);dv.setUint8(123,2);dv.setInt16(254,1,true);
  // NIfTI sform is RAS: invert the first two physical axes from DICOM LPS.
  for(let row=0;row<3;row++){
    const sign=row<2?-1:1;
    for(let col=0;col<3;col++)dv.setFloat32(280+row*16+col*4,sign*a.matrix[row*3+col],true);
    dv.setFloat32(292+row*16,sign*a.origin[row],true);
  }
  new Uint8Array(header,344,4).set([110,43,49,0]);
  const description=new TextEncoder().encode('Signed window-normalized difference');
  new Uint8Array(header,148,Math.min(79,description.length)).set(description.slice(0,79));
  return header;
}
