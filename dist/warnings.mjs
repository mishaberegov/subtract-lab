// Attach every volume warning to its upload slot, not to a DICOM series name.
export function formatWarningLines(a,b,demo=false){
  const lines=[];
  for(const [slot,volume] of [['A',a],['B',b]]){
    if(volume?.warnings?.length)lines.push(`Серия ${slot}. ${[...new Set(volume.warnings)].join(' ')}`);
  }
  if(a&&b&&!demo&&a.frameUID!==b.frameUID)lines.push('Пара A/B. Frame of Reference серий различается. Проверь совмещение и выполни корегистрацию.');
  return lines;
}
