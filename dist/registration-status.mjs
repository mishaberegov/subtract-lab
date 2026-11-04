const text = {
  'not-run': 'Корегистрация пока не выполнялась',
  complete: 'Корегистрация завершена',
  stale: 'Корегистрация с текущими параметрами не выполнялась. Нажми «Корегистрировать»',
  manual: 'Серия B смещена вручную'
};
export function registrationStatusText(state) {
  return text[state];
}
export function registrationFeedback(after) {
  if (
    !Number.isFinite(after.score) ||
    !Number.isFinite(after.overlap) ||
    after.overlap < 0.35 ||
    after.n < 40
  )
    return {
      type: 'warning',
      note: 'Недостаточно совпадающих точек для надёжной оценки. Проверь совмещение вручную.'
    };
  if (after.overlap < 0.65)
    return {
      type: '',
      note: 'Ограниченное перекрытие выбранных точек; проверь совмещение в нескольких срезах и плоскостях.'
    };
  return {
    type: '',
    note: 'Проверь совмещение в нескольких срезах и плоскостях; метрика не гарантирует точность.'
  };
}
export function nextRegistrationState(current, event, hasCompleted = false) {
  if (event === 'volume') return 'not-run';
  if (event === 'success') return 'complete';
  if (event === 'manual') return 'manual';
  if (event === 'metric')
    return current === 'not-run'
      ? 'not-run'
      : current === 'manual' && !hasCompleted
        ? 'manual'
        : 'stale';
  if (event === 'reset')
    return current === 'not-run' || (current === 'manual' && !hasCompleted) ? 'not-run' : 'stale';
  return current;
}
