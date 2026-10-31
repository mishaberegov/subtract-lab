export function formatSeriesDate({date,dateSource},language='en'){
  const ru=language==='ru';
  if(dateSource==='mixed')return ru?'Разные даты':'Different dates';
  if(!date)return ru?'Дата не указана':'Date unavailable';
  return `${date.slice(8,10)}-${date.slice(5,7)}-${date.slice(0,4)}`;
}
export function seriesDateSource({date,dateSource},language='en'){
  if(!date||dateSource==='mixed')return '';
  const labels=language==='ru'?{series:'Дата серии',acquisition:'Дата съёмки',study:'Дата исследования'}:{series:'Series date',acquisition:'Acquisition date',study:'Study date'};
  return labels[dateSource]||labels.series;
}
