const text={
  'not-run':'Корегистрация пока не выполнялась',
  complete:'Корегистрация завершена',
  stale:'Параметры изменены, перезапусти корегистрацию',
  manual:'Серия B смещена вручную'
};
export function registrationStatusText(state){return text[state];}
export function nextRegistrationState(current,event,hasCompleted=false){
  if(event==='volume')return 'not-run';
  if(event==='success')return 'complete';
  if(event==='manual')return 'manual';
  if(event==='metric')return current==='not-run'?'not-run':current==='manual'&&!hasCompleted?'manual':'stale';
  if(event==='reset')return current==='not-run'||current==='manual'&&!hasCompleted?'not-run':'stale';
  return current;
}
