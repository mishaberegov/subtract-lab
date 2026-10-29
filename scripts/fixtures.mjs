// Synthetic, anonymous DICOM fixtures. No clinical or personal information.
import {makeDemo} from '../dist/core.mjs';
import {zipSync} from 'fflate';
import {writeFile,mkdir} from 'node:fs/promises';
const text=(s,pad=' ')=>{const b=new TextEncoder().encode(s);if(b.length%2){const o=new Uint8Array(b.length+1);o.set(b);o[o.length-1]=pad.charCodeAt(0);return o;}return b;};
const join=parts=>{const o=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let n=0;for(const p of parts){o.set(p,n);n+=p.length;}return o;};
export function element(group,tag,vr,value,little=true){
  if(typeof value==='string')value=text(value,vr==='UI'?'\0':' ');
  if(typeof value==='number'){const x=new Uint8Array(2);new DataView(x.buffer).setUint16(0,value,little);value=x;}
  const long=['OB','OW','OF','OD','SQ','UN','UT'].includes(vr),h=new Uint8Array(long?12:8),dv=new DataView(h.buffer);dv.setUint16(0,group,little);dv.setUint16(2,tag,little);h[4]=vr.charCodeAt(0);h[5]=vr.charCodeAt(1);if(long)dv.setUint32(8,value.length,little);else dv.setUint16(6,value.length,little);return join([h,value]);
}
export function dicomSlice({z=0,rows=4,cols=5,values=null,signed=false,bitsStored=16,highBit=15,slope=1,intercept=0,origin=[0,0,z*2],spacing=[1.5,1.2],iop=[1,0,0,0,1,0],uid='2.25.1200001',little=true,description='Synthetic test',ts=null,pixelBytes=null,padding=null,sliceThickness=2,acquisition=null,modality='MR'}={}){
  const pre=new Uint8Array(132);pre.set([68,73,67,77],128);const syntax=ts||(little?'1.2.840.10008.1.2.1':'1.2.840.10008.1.2.2');
  const meta=element(2,0x10,'UI',syntax),fields=[];const add=(g,t,v,x)=>fields.push(element(g,t,v,x,little));
  add(8,0x16,'UI','1.2.840.10008.5.1.4.1.1.4');add(8,0x18,'UI',uid+'.'+(z+1));add(8,0x60,'CS',modality);add(8,0x103e,'LO',description);
  add(0x18,0x50,'DS',String(sliceThickness));add(0x20,0x0e,'UI',uid);add(0x20,0x11,'IS','1');if(acquisition!==null)add(0x20,0x12,'IS',String(acquisition));add(0x20,0x13,'IS',String(z+1));add(0x20,0x32,'DS',origin.join('\\'));add(0x20,0x37,'DS',iop.join('\\'));add(0x20,0x52,'UI','2.25.119999');
  add(0x28,2,'US',1);add(0x28,4,'CS','MONOCHROME2');add(0x28,0x10,'US',rows);add(0x28,0x11,'US',cols);add(0x28,0x30,'DS',spacing.join('\\'));add(0x28,0x100,'US',16);add(0x28,0x101,'US',bitsStored);add(0x28,0x102,'US',highBit);add(0x28,0x103,'US',signed?1:0);
  if(padding!==null)add(0x28,0x120,signed?'SS':'US',padding&65535);
  add(0x28,0x1050,'DS','500');add(0x28,0x1051,'DS','1000');add(0x28,0x1052,'DS',String(intercept));add(0x28,0x1053,'DS',String(slope));
  if(pixelBytes){
    // Encapsulated pixel data with a one-entry basic offset table.
    const h=new Uint8Array(12),hdv=new DataView(h.buffer);hdv.setUint16(0,0x7fe0,true);hdv.setUint16(2,0x10,true);h[4]=79;h[5]=66;hdv.setUint32(8,0xffffffff,true);
    const item=data=>{const h=new Uint8Array(8);const d=new DataView(h.buffer);d.setUint16(0,0xfffe,true);d.setUint16(2,0xe000,true);d.setUint32(4,data.length,true);return join([h,data]);};
    if(pixelBytes.length%2)pixelBytes=join([pixelBytes,new Uint8Array(1)]);
    const delim=new Uint8Array(8);const d=new DataView(delim.buffer);d.setUint16(0,0xfffe,true);d.setUint16(2,0xe0dd,true);fields.push(h,item(new Uint8Array(4)),item(pixelBytes),delim);
  }else{
    const data=new Uint8Array(rows*cols*2),dv=new DataView(data.buffer);for(let i=0;i<rows*cols;i++)dv.setUint16(i*2,(values?.[i]??(i+z*20))&65535,little);add(0x7fe0,0x10,'OW',data);
  }
  return join([pre,meta,...fields]);
}
export async function writeDemoZip(directory){
  await mkdir(directory,{recursive:true});const {a,b}=makeDemo(112);
  for(const [key,v]of [['a',a],['b',b]]){const files={};for(let z=0;z<v.dims[2];z++)files['slice-'+String(z).padStart(3,'0')+'.dcm']=dicomSlice({z,rows:v.dims[1],cols:v.dims[0],values:Array.from(v.data.subarray(z*v.dims[0]*v.dims[1],(z+1)*v.dims[0]*v.dims[1]),Math.round),origin:[v.origin[0],v.origin[1],v.origin[2]+z*v.matrix[8]],spacing:[v.matrix[4],v.matrix[0]],uid:'2.25.9876500'+(key==='a'?1:2),description:'Synthetic phantom '+key.toUpperCase()});await writeFile(directory+'/demo-'+key+'.zip',zipSync(files));}
}
if(process.argv[2])await writeDemoZip(process.argv[2]);
