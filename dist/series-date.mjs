export function formatSeriesDate({date,dateSource},language='en'){
  const ru=language==='ru';
  if(dateSource==='mixed')return ru?'Разные даты':'Different dates';
  if(!date)return ru?'Дата не указана':'Date unavailable';
  const labels=ru?{series:'Серия',acquisition:'Съёмка',study:'Исследование'}:{series:'Series',acquisition:'Acquired',study:'Study'};
  const shown=ru?`${date.slice(8,10)}.${date.slice(5,7)}.${date.slice(0,4)}`:date;
  return `${labels[dateSource]||labels.series}: ${shown}`;
}
