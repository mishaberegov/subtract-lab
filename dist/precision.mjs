// CT-only working storage. The original DICOM files are never altered.
export function compactCTVolume(volume,options={}){
  const Float16Ctor=Object.hasOwn(options,'Float16Ctor')?options.Float16Ctor:globalThis.Float16Array;
  if(volume.modality!=='CT'||!(volume.data instanceof Float32Array)||typeof Float16Ctor!=='function')return volume;
  const source=volume.data,half=new Float16Ctor(source.length);
  let maxErrorHU=0;
  for(let i=0;i<source.length;i++){
    const original=source[i];
    half[i]=original;
    const converted=half[i];
    if(Number.isNaN(original)){if(!Number.isNaN(converted))return volume;continue;}
    if(!Number.isFinite(original)||!Number.isFinite(converted))return volume;
    maxErrorHU=Math.max(maxErrorHU,Math.abs(original-converted));
    if(maxErrorHU>1)return volume;
  }
  volume.data=half;
  volume.precision={format:'Float16',maxErrorHU};
  (volume.warnings??=[]).push('Рабочие значения КТ сохранены в Float16 (погрешность до 1 HU); исходные DICOM не изменены. Проверяй количественное вычитание.');
  return volume;
}
