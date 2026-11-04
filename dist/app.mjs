import { clamp, makeDemo } from './core.mjs?v=1.1.9-simple1';
import { gridSpacing } from './resampling.mjs';
import { sourcePlane, planeMapping } from './orientation.mjs';
import { displayExtent, displayPlane } from './display-grid.mjs?v=1.1.7-grid1';
import { imageBounds, pointerToImage } from './comparison-window.mjs';
import {
  dragTranslation,
  rotateInPlane,
  rotationDragDegrees
} from './manual-alignment.mjs?v=1.1.0-fusion1';

import {
  nextRegistrationState,
  registrationStatusText,
  registrationFeedback
} from './registration-status.mjs?v=1.2.0-quality1';
import {
  languageFromUrl,
  languageUrl,
  localizeDocument,
  localizeMessage
} from './localization.mjs?v=1.2.0-readable1';
import { formatWarningLines } from './warnings.mjs?v=1.1.8-warnings1';
import { formatSeriesDate, seriesDateSource } from './series-date.mjs?v=1.1.7-date3';
import { createRenderer } from './renderer.mjs?v=1.2.0-readable1';
import { createExportActions } from './export-actions.mjs?v=1.2.0-readable1';
const $ = id => document.getElementById(id);
const language = languageFromUrl(location.href);
localizeDocument(document, language);
for (const [id, lang] of [
  ['langEn', 'en'],
  ['langRu', 'ru']
]) {
  $(id).href = languageUrl(location.href, lang);
  if (lang === language) $(id).setAttribute('aria-current', 'page');
}
// Only application-owned output is translated; patient series names and DICOM metadata stay intact.
const translatedIds = new Set([
  'toast',
  'regStatus',
  'resampleStatus',
  'gridA',
  'gridB',
  'gridTarget',
  'gridAMeta',
  'gridBMeta',
  'gridTargetMeta',
  'labelA',
  'labelB',
  'grayNote',
  'scanSummary',
  'registrationReport',
  'warningNotice',
  'registerBtn',
  'exportNifti'
]);
const uiObserver = new MutationObserver(records => {
  if (language === 'ru') return;
  for (const record of records) {
    const el = record.target.nodeType === 3 ? record.target.parentElement : record.target;
    const root = el?.closest?.('[id]');
    if (!root || !translatedIds.has(root.id)) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (root.dataset.patientName === 'true') continue;
      const text = localizeMessage(node.nodeValue, language);
      if (text !== node.nodeValue) node.nodeValue = text;
    }
  }
});
uiObserver.observe(document.body, { subtree: true, childList: true, characterData: true });
const state = {
  a: null,
  b: null,
  bOnA: null,
  resampleWorker: null,
  resampleTimer: null,
  resampleBusy: false,
  manualDragging: false,
  params: [0, 0, 0, 0, 0, 0],
  windows: { a: { level: 500, width: 1000 }, b: { level: 500, width: 1000 } },
  plane: 'axial',
  slice: 0,
  overlaySlice: 0,
  display: 'difference',
  reveal: { x: 0.5, y: 0.5 },
  zoom: 1,
  registration: null,
  registrationStage: 'not-run',
  hasCompletedRegistration: false,
  regWorker: null,
  loadWorkers: {},
  zipCache: null,
  loading: new Set(),
  demo: false
};
for (const [id, lang] of [
  ['langEn', 'en'],
  ['langRu', 'ru']
])
  $(id).addEventListener('click', event => {
    if (lang === language) {
      event.preventDefault();
      return;
    }
    const unsaved = !!(
      state.loading.size ||
      (state.a && !state.a?.synthetic) ||
      (state.b && !state.b?.synthetic) ||
      state.registration ||
      state.params.some(x => x !== 0)
    );
    if (
      unsaved &&
      !confirm(
        language === 'ru'
          ? 'Смена языка перезагрузит страницу и удалит загруженные серии и несохранённое совмещение. Продолжить?'
          : 'Switching language reloads the page and clears loaded series and unsaved alignment. Continue?'
      )
    )
      event.preventDefault();
  });
let toastTimer,
  renderFrame,
  pickSlot = 'a',
  activeScan = null;
const format = (x, n = 1) =>
  Number.isFinite(x)
    ? Number(x.toFixed(n)).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')
    : '—';
function toast(message, error = false) {
  $('toast').textContent = message;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), error ? 16000 : 6000);
}
function regStatus(text, type = '') {
  const e = $('regStatus');
  e.replaceChildren();
  const dot = document.createElement('span');
  dot.className = 'status-dot ' + type;
  const label = document.createElement('span');
  label.textContent = text;
  e.append(dot, label);
}
function setRegistrationStage(event, quality) {
  state.registrationStage = nextRegistrationState(
    state.registrationStage,
    event,
    state.hasCompletedRegistration
  );
  if (event === 'volume') state.hasCompletedRegistration = false;
  if (event === 'success') state.hasCompletedRegistration = true;
  regStatus(
    registrationStatusText(state.registrationStage),
    quality ??
      (state.registrationStage === 'complete'
        ? ''
        : state.registrationStage === 'not-run'
          ? ''
          : 'warning')
  );
}
function updateButtons() {
  const both = !!(state.a && state.b),
    loading = state.loading.size > 0,
    ready = both && !!state.bOnA && !state.resampleBusy && !state.manualDragging;
  $('registerBtn').disabled = !both || loading || state.manualDragging;
  $('metric').disabled = !!state.regWorker;
  $('manualMode').disabled = !ready || loading || !!state.regWorker;
  $('exportPng').disabled = !ready || loading || !!state.regWorker;
  $('exportTransform').disabled = !ready || loading || !!state.regWorker;
  $('exportNifti').disabled = !ready || loading || !!state.regWorker;
  $('exportOverlayDicom').disabled =
    !ready ||
    loading ||
    !!state.regWorker ||
    !!state.b?.synthetic ||
    !state.b?.study?.studyUID ||
    !state.b?.frameUID ||
    state.display !== 'blend' ||
    $('overlayLut').value !== 'gray';
  document.querySelectorAll('[data-auto]').forEach(b => (b.disabled = !state[b.dataset.auto]));
}
function updateGridInfo() {
  const both = !!(state.a && state.b);
  $('geometryStrip').hidden = !both;
  for (const slot of ['a', 'b']) {
    const v = state[slot],
      up = slot.toUpperCase();
    if (!v) continue;
    $('grid' + up).textContent =
      gridSpacing(v)
        .map(x => format(x, 2))
        .join(' × ') + ' мм';
    $('grid' + up + 'Meta').textContent =
      v.dims.join(' × ') +
      ' · толщина ' +
      (v.sliceThicknessMm > 0 ? format(v.sliceThicknessMm, 2) + ' мм' : 'не указана');
  }
  if (both) {
    $('gridTarget').textContent =
      gridSpacing(state.a)
        .map(x => format(x, 2))
        .join(' × ') + ' мм';
    $('gridTargetMeta').textContent =
      state.a.dims.join(' × ') + ' · ' + (state.bOnA ? 'готово' : 'рассчитывается');
    const source = gridSpacing(state.b),
      target = gridSpacing(state.a);
    $('resolutionNote').hidden = !source.some((s, i) => s > target[i] * 1.1);
  }
}
function stopResampling() {
  clearTimeout(state.resampleTimer);
  state.resampleTimer = null;
  state.resampleWorker?.terminate();
  state.resampleWorker = null;
  state.resampleBusy = false;
}
function scheduleResampling(delay = 0) {
  stopResampling();
  state.bOnA = null;
  updateGridInfo();
  if (!(state.a && state.b)) {
    $('resampleStatus').textContent = 'Автоматически после загрузки A и B';
    updateButtons();
    return;
  }
  state.resampleBusy = true;
  $('resampleStatus').textContent = 'Подготовка сетки A…';
  updateButtons();
  requestRender();
  state.resampleTimer = setTimeout(() => {
    state.resampleTimer = null;
    const worker = new Worker('./resample-worker.mjs?v=1.1.0', { type: 'module' });
    state.resampleWorker = worker;
    const fail = message => {
      if (state.resampleWorker !== worker) return;
      stopResampling();
      $('resampleStatus').textContent = 'Ресэмплинг не выполнен';
      $('gridTargetMeta').textContent = 'Нет готового объёма';
      updateButtons();
      toast(message, true);
    };
    worker.onmessage = ({ data }) => {
      if (state.resampleWorker !== worker) return;
      if (data.type === 'progress')
        $('resampleStatus').textContent =
          data.phase + ' · ' + Math.round(data.fraction * 100) + '%';
      if (data.type === 'error') fail(data.message);
      if (data.type === 'done') {
        state.bOnA = data.volume;
        stopResampling();
        const info = state.bOnA.resampling;
        $('resampleStatus').textContent =
          'B в сетке A · перекрытие ' +
          format(info.validFraction * 100, 1) +
          '%' +
          (info.filterApplied ? ' · со сглаживанием' : '');
        updateGridInfo();
        updateButtons();
        requestRender();
      }
    };
    worker.onerror = e => fail(e.message || 'Ошибка ресэмплинга.');
    const a = state.a,
      reference = {
        dims: a.dims,
        matrix: a.matrix,
        origin: a.origin,
        frameUID: a.frameUID,
        sliceThicknessMm: a.sliceThicknessMm
      };
    worker.postMessage({
      reference,
      moving: state.b,
      params: [...state.params],
      antiAlias: $('antiAlias').checked
    });
  }, delay);
}
function invalidateRegistration() {
  state.registration = null;
  $('registrationReport').hidden = true;
  setRegistrationStage('manual');
}
function cancelManualMode() {
  state.manualDragging = false;
  manualExtent = null;
  $('manualMode').checked = false;
  $('manualHint').hidden = true;
  document.querySelectorAll('[data-rotate-handle]').forEach(h => (h.hidden = true));
  canvases.r.parentElement.classList.remove('manual-active');
  updateButtons();
}
function resetRegistration(event = 'reset') {
  cancelManualMode();
  if (state.regWorker) stopRegistration(false);
  state.params = [0, 0, 0, 0, 0, 0];
  state.registration = null;
  $('registrationReport').hidden = true;
  setRegistrationStage(event);
  configureSlice();
  updateWarnings();
  scheduleResampling();
}
function updateWarnings() {
  const warnings = formatWarningLines(state.a, state.b, state.demo);
  if (state.a && state.b && displayExtent(state.a, state.b, state.params, state.plane).limited)
    warnings.push(
      language === 'ru'
        ? 'Серии слишком далеко друг от друга для общего окна; B вне сетки A не показана.'
        : 'Series are too far apart for a shared view; B outside the A grid is not shown.'
    );
  $('warningNotice').hidden = !warnings.length;
  $('warningNotice').textContent = warnings.join('\n');
}
function setVolume(slot, volume) {
  state[slot] = volume;
  state.demo = !!(state.a?.synthetic && state.b?.synthetic);
  $('demoMarker').hidden = $('clearBtn').hidden = !state.demo;
  state.plane = sourcePlane(state.a || state.b);
  document
    .querySelectorAll('[data-plane]')
    .forEach(b => b.classList.toggle('active', b.dataset.plane === state.plane));
  state.windows[slot] = { ...volume.window };
  const up = slot.toUpperCase();
  $('wl' + up).value = Number(volume.window.level.toFixed(2));
  $('ww' + up).value = Number(volume.window.width.toFixed(2));
  const label = $('label' + up);
  label.dataset.patientName = volume.synthetic ? 'false' : 'true';
  label.textContent = volume.synthetic ? '' : volume.name;
  label.title = volume.synthetic ? '' : volume.name;
  $('dot' + up).classList.add('loaded');
  const name = $('name' + up);
  name.hidden = !!volume.synthetic;
  name.textContent = volume.synthetic ? '' : volume.name;
  name.title = volume.synthetic ? '' : volume.name;
  const date = $('date' + up);
  date.hidden = !!volume.synthetic;
  date.textContent = volume.synthetic ? '' : formatSeriesDate(volume, language);
  date.title = volume.synthetic ? '' : seriesDateSource(volume, language);
  resetRegistration('volume');
  resetView();
  configureOverlaySlice(true);
  updateWarnings();
  updateButtons();
}
function resetView() {
  state.zoom = 1;
  const v = state.a || state.b;
  if (v) state.slice = Math.floor(sliceCount(v) / 2);
  configureSlice();
  requestRender();
}
function sliceCount(v) {
  return v.dims[planeMapping(v, state.plane, 0).normalAxis];
}
let manualExtent = null;
function viewExtent() {
  if ($('manualMode').checked && manualExtent) return manualExtent;
  return state.a
    ? displayExtent(state.a, state.b, state.params, state.plane)
    : state.b
      ? displayExtent(state.b, null, state.params, state.plane)
      : null;
}
function configureSlice() {
  const extent = viewExtent();
  if (!extent) {
    $('sliceSlider').disabled = true;
    $('sliceSlider').min = 0;
    $('sliceSlider').max = 0;
    $('sliceNumber').textContent = '— / —';
    return;
  }
  state.slice = clamp(Math.round(state.slice), extent.min, extent.max);
  $('sliceSlider').disabled = false;
  $('sliceSlider').min = extent.min;
  $('sliceSlider').max = extent.max;
  $('sliceSlider').value = state.slice;
  $('sliceNumber').textContent =
    state.slice - extent.min + 1 + ' / ' + (extent.max - extent.min + 1);
}
function configureOverlaySlice(reset = false) {
  const b = state.b,
    slider = $('overlaySlice');
  if (!b) {
    slider.disabled = true;
    slider.min = slider.max = slider.value = 0;
    $('overlaySliceValue').textContent = '—';
    return;
  }
  const axis = planeMapping(b, state.plane, 0).normalAxis,
    n = b.dims[axis];
  state.overlaySlice = reset ? Math.floor(n / 2) : clamp(state.overlaySlice, 0, n - 1);
  slider.disabled = false;
  slider.min = 0;
  slider.max = n - 1;
  slider.value = state.overlaySlice;
  $('overlaySliceValue').textContent = state.overlaySlice + 1 + ' / ' + n;
}
function stepSlice(delta) {
  if (!(state.a || state.b)) return;
  state.slice += delta;
  configureSlice();
  requestRender();
}
function stepOverlaySlice(delta) {
  if (!state.b) return;
  state.overlaySlice += delta;
  configureOverlaySlice();
  requestRender();
}
function requestRender() {
  if (!renderFrame)
    renderFrame = requestAnimationFrame(() => {
      renderFrame = null;
      render();
    });
}
function planeInfo(v) {
  const extent = viewExtent();
  return extent
    ? displayPlane(v, state.plane, state.slice, extent)
    : planeMapping(v, state.plane, state.slice);
}
const canvases = { a: $('canvasA'), b: $('canvasB'), r: $('canvasR') };
const render = createRenderer({ state, canvases, element: $, planeInfo, format });
function loadFiles(slot, files) {
  if (!files.length) return;
  if (state.a?.synthetic || state.b?.synthetic) clearAll(false);
  if (state.regWorker) stopRegistration(false);
  if (state.zipCache?.worker === state.loadWorkers[slot]) state.zipCache = null;
  state.loadWorkers[slot]?.terminate();
  const file = files[0],
    cached = state.zipCache;
  const reuse =
    files.length === 1 &&
    /\.zip$/i.test(file.name) &&
    cached &&
    file.name === cached.file.name &&
    file.size === cached.file.size &&
    file.lastModified === cached.file.lastModified;
  if (cached && !reuse) {
    cached.worker.terminate();
    state.zipCache = null;
  }
  const worker = reuse ? cached.worker : new Worker('./io-worker.js?v=1.2.0-readable1');
  state.loadWorkers[slot] = worker;
  state.loading.add(slot);
  updateButtons();
  const up = slot.toUpperCase();
  $('label' + up).dataset.patientName = 'false';
  $('label' + up).title = '';
  $('label' + up).textContent = 'Чтение файлов…';
  let cacheable = false;
  worker.onmessage = ({ data }) => {
    if (state.loadWorkers[slot] !== worker) return;
    if (data.type === 'progress') {
      $('label' + up).textContent = data.text + ' · ' + Math.round(data.fraction * 100) + '%';
    }
    if (data.type === 'groups') {
      cacheable = !!data.cachedZip;
      const choose = key => {
        worker.postMessage({ type: 'build', key });
      };
      if (data.skipped)
        toast(
          'Пропущено файлов: ' + data.skipped + '. ' + (data.errors[0] || 'Объекты без PixelData.')
        );
      if (data.groups.length === 1) choose(data.groups[0].key);
      else {
        // A second scan replaces the chooser, but does not discard either volume.
        if (activeScan) {
          const old = activeScan.slot,
            previous = state.loadWorkers[old];
          previous?.terminate();
          if (state.zipCache?.worker === previous) state.zipCache = null;
          delete state.loadWorkers[old];
          state.loading.delete(old);
          restoreSlotLabel(old);
        }
        activeScan = { slot, choose };
        $('scanSummary').textContent =
          'Для серии ' + up + ' найдено объёмов: ' + data.groups.length + '. Выбери нужный.';
        $('seriesList').replaceChildren();
        for (const group of data.groups) {
          const btn = document.createElement('button');
          btn.className = 'series-choice';
          const text = document.createElement('div'),
            title = document.createElement('strong'),
            meta = document.createElement('small');
          title.textContent = group.name;
          meta.textContent =
            formatSeriesDate(group, language) +
            ' · ' +
            group.modality +
            ' · ' +
            (language === 'ru' ? 'серия' : 'series') +
            ' ' +
            group.series +
            ' · ' +
            group.dims.join(' × ') +
            (group.echo ? ' · ' + (language === 'ru' ? 'эхо' : 'echo') + ' ' + group.echo : '');
          meta.title = seriesDateSource(group, language);
          text.append(title, meta);
          btn.append(text);
          btn.addEventListener('click', () => {
            activeScan = null;
            $('seriesDialog').close();
            choose(group.key);
          });
          $('seriesList').append(btn);
        }
        if (!$('seriesDialog').open) $('seriesDialog').showModal();
      }
    }
    if (data.type === 'volume') {
      state.loading.delete(slot);
      setVolume(slot, data.volume);
      if (cacheable) state.zipCache = { worker, file };
      else {
        worker.terminate();
        if (state.zipCache?.worker === worker) state.zipCache = null;
      }
      delete state.loadWorkers[slot];
      toast('Серия ' + up + ' загружена: ' + data.volume.dims.join(' × '));
    }
    if (data.type === 'error') {
      finishError(data.message);
    }
  };
  function finishError(message) {
    state.loading.delete(slot);
    worker.terminate();
    if (state.zipCache?.worker === worker) state.zipCache = null;
    delete state.loadWorkers[slot];
    restoreSlotLabel(slot);
    updateButtons();
    toast(message, true);
  }
  worker.onerror = e =>
    finishError('Ошибка чтения DICOM: ' + (e.message || 'проверь формат файлов.'));
  worker.postMessage({ type: 'scan', slot, files: Array.from(files), reuse: !!reuse });
}
function restoreSlotLabel(slot) {
  const v = state[slot],
    label = $('label' + slot.toUpperCase());
  label.dataset.patientName = v && !v.synthetic ? 'true' : 'false';
  label.textContent = v ? (v.synthetic ? '' : v.name) : 'Не загружен';
  label.title = v && !v.synthetic ? v.name : '';
}
function cancelScan() {
  if (activeScan) {
    const slot = activeScan.slot,
      worker = state.loadWorkers[slot];
    worker?.terminate();
    if (state.zipCache?.worker === worker) state.zipCache = null;
    delete state.loadWorkers[slot];
    state.loading.delete(slot);
    restoreSlotLabel(slot);
    activeScan = null;
    updateButtons();
  }
  if ($('seriesDialog').open) $('seriesDialog').close();
}
function startRegistration() {
  if (state.regWorker) {
    stopRegistration();
    return;
  }
  if (!(state.a && state.b)) return;
  cancelManualMode();
  const worker = new Worker('./register-worker.mjs?v=1.1.1-fov1', { type: 'module' });
  state.regWorker = worker;
  $('registerBtn').classList.add('running');
  $('registerBtn').textContent = 'Остановить';
  $('regProgress').hidden = false;
  $('regProgress').firstElementChild.style.width = '0%';
  regStatus('Поиск смещения и вращения…');
  updateButtons();
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      $('regProgress').firstElementChild.style.width =
        Math.max(2, Math.round(data.fraction * 100)) + '%';
      regStatus(
        'Уровень ' +
          data.level +
          ' / ' +
          data.levels +
          ' · ' +
          Math.round(data.fraction * 100) +
          '%'
      );
    }
    if (data.type === 'done') {
      state.params = data.result.params;
      state.registration = data.result;
      stopRegistration(false);
      configureSlice();
      updateWarnings();
      scheduleResampling();
      const r = data.result,
        feedback = registrationFeedback(r.after);
      setRegistrationStage('success', feedback.type);
      $('registrationReport').hidden = false;
      $('registrationReport').textContent =
        'Корегистрация ' +
        r.method.toUpperCase() +
        ' · метрика ' +
        format(r.before.score, 4) +
        ' → ' +
        format(r.after.score, 4) +
        ' · перекрытие выбранных точек ' +
        format(r.after.overlap * 100, 1) +
        '%. Смещение A → B: ' +
        r.params
          .slice(0, 3)
          .map(x => format(x, 2))
          .join(' / ') +
        ' мм; вращение: ' +
        r.params
          .slice(3)
          .map(x => format(x, 2))
          .join(' / ') +
        '°. ' +
        feedback.note;
      requestRender();
    }
    if (data.type === 'error') {
      stopRegistration();
      toast(data.message, true);
    }
  };
  worker.onerror = e => {
    stopRegistration();
    toast(e.message || 'Ошибка вычисления.', true);
  };
  worker.postMessage({ a: state.a, b: state.b, method: $('metric').value, initial: state.params });
}
function stopRegistration(announce = true) {
  state.regWorker?.terminate();
  state.regWorker = null;
  $('registerBtn').classList.remove('running');
  $('registerBtn').innerHTML = '<svg><use href="#i-cross"/></svg>Корегистрировать';
  $('regProgress').hidden = true;
  if (announce) setRegistrationStage('stop');
  updateButtons();
}
function demo() {
  clearAll(false);
  const pair = makeDemo();
  setVolume('a', pair.a);
  setVolume('b', pair.b);
  state.demo = true;
  $('demoMarker').hidden = $('clearBtn').hidden = false;
  state.slice = Math.round(pair.a.dims[2] / 2 + 1);
  configureSlice();
  requestRender();
}
function clearAll(announce = true) {
  cancelManualMode();
  stopRegistration(false);
  stopResampling();
  state.bOnA = null;
  for (const worker of Object.values(state.loadWorkers)) worker.terminate();
  state.loadWorkers = {};
  state.zipCache?.worker.terminate();
  state.zipCache = null;
  state.loading.clear();
  cancelScan();
  state.a = state.b = null;
  state.demo = false;
  state.slice = 0;
  state.zoom = 1;
  state.params = [0, 0, 0, 0, 0, 0];
  state.registration = null;
  state.registrationStage = 'not-run';
  state.hasCompletedRegistration = false;
  for (const slot of ['a', 'b']) {
    restoreSlotLabel(slot);
    $('label' + slot.toUpperCase()).textContent = 'Не загружен';
    $('name' + slot.toUpperCase()).hidden = true;
    $('name' + slot.toUpperCase()).textContent = '';
    $('name' + slot.toUpperCase()).title = '';
    $('date' + slot.toUpperCase()).hidden = true;
    $('date' + slot.toUpperCase()).title = '';
    $('dot' + slot.toUpperCase()).classList.remove('loaded');
  }
  $('demoMarker').hidden = $('clearBtn').hidden = true;
  $('warningNotice').hidden = true;
  $('registrationReport').hidden = true;
  setRegistrationStage('volume');
  configureSlice();
  updateButtons();
  requestRender();
  if (announce) toast('Рабочая область очищена.');
  $('geometryStrip').hidden = true;
  $('resampleStatus').textContent = 'Автоматически после загрузки A и B';
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}
const { exportTransform, exportNifti, exportOverlayDicom } = createExportActions({
  state,
  element: $,
  language,
  toast,
  updateButtons,
  saveBlob
});
document.querySelectorAll('[data-pick]').forEach(btn =>
  btn.addEventListener('click', () => {
    pickSlot = btn.dataset.pick;
    const input = $(btn.dataset.kind === 'folder' ? 'folderInput' : 'fileInput');
    input.value = '';
    input.click();
  })
);
for (const id of ['fileInput', 'folderInput'])
  $(id).addEventListener('change', e => loadFiles(pickSlot, e.target.files));
for (const slot of ['a', 'b']) {
  const target = $('drop' + slot.toUpperCase());
  target.addEventListener('dragover', e => {
    e.preventDefault();
    target.classList.add('drag');
  });
  target.addEventListener('dragleave', () => target.classList.remove('drag'));
  target.addEventListener('drop', async e => {
    e.preventDefault();
    target.classList.remove('drag');
    const items = Array.from(e.dataTransfer.items || []),
      entries = items.map(i => i.webkitGetAsEntry?.()).filter(Boolean);
    if (entries.some(e => e.isDirectory)) {
      const files = [];
      async function walk(entry) {
        if (entry.isFile) {
          files.push(await new Promise((resolve, reject) => entry.file(resolve, reject)));
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          while (true) {
            const batch = await new Promise((resolve, reject) =>
              reader.readEntries(resolve, reject)
            );
            if (!batch.length) break;
            for (const child of batch) await walk(child);
          }
        }
      }
      try {
        for (const entry of entries) await walk(entry);
        loadFiles(slot, files);
      } catch (err) {
        toast('Не удалось прочитать папку: ' + err.message, true);
      }
    } else loadFiles(slot, e.dataTransfer.files);
  });
  target.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === target) {
      e.preventDefault();
      pickSlot = slot;
      $('fileInput').value = '';
      $('fileInput').click();
    }
  });
  for (const kind of ['wl', 'ww'])
    $(kind + slot.toUpperCase()).addEventListener('input', e => {
      const v = Number(e.target.value);
      if (!Number.isFinite(v) || (kind === 'ww' && v < 1)) return;
      state.windows[slot][kind === 'wl' ? 'level' : 'width'] = v;
      requestRender();
    });
}
document.querySelectorAll('[data-auto]').forEach(btn =>
  btn.addEventListener('click', () => {
    const slot = btn.dataset.auto;
    if (!state[slot]) return;
    state.windows[slot] = { level: state[slot].stats.level, width: state[slot].stats.width };
    $('wl' + slot.toUpperCase()).value = Number(state.windows[slot].level.toFixed(2));
    $('ww' + slot.toUpperCase()).value = Number(state.windows[slot].width.toFixed(2));
    requestRender();
  })
);
$('manualMode').addEventListener('change', () => {
  if ($('manualMode').checked && state.regWorker) stopRegistration(false);
  if ($('manualMode').checked) document.querySelector('[data-display="difference"]').click();
  else {
    manualExtent = null;
    configureSlice();
    requestRender();
  }
  $('manualHint').hidden = !$('manualMode').checked;
  document
    .querySelectorAll('[data-rotate-handle]')
    .forEach(h => (h.hidden = !$('manualMode').checked));
  canvases.r.parentElement.classList.toggle('manual-active', $('manualMode').checked);
  updateButtons();
});
$('metric').addEventListener('change', () => {
  setRegistrationStage('metric');
  $('registrationReport').hidden = true;
});
$('antiAlias').addEventListener('change', () => scheduleResampling());
document.querySelectorAll('[data-plane]').forEach(btn =>
  btn.addEventListener('click', () => {
    state.plane = btn.dataset.plane;
    manualExtent = null;
    document.querySelectorAll('[data-plane]').forEach(b => b.classList.toggle('active', b === btn));
    resetView();
    configureOverlaySlice(true);
    updateWarnings();
  })
);
document.querySelectorAll('[data-display]').forEach(btn =>
  btn.addEventListener('click', () => {
    state.display = btn.dataset.display;
    if (state.display !== 'difference' && $('manualMode').checked) cancelManualMode();
    document
      .querySelectorAll('[data-display]')
      .forEach(b => b.classList.toggle('active', b === btn));
    const blend = state.display === 'blend';
    $('slabControl').hidden = state.display !== 'difference';
    $('resultSlab').disabled = state.display !== 'difference';
    $('revealControls').hidden = state.display !== 'window';
    $('fusionControls').hidden = !blend;
    $('overlayLutControl').hidden = !blend;
    $('overlaySliceControl').hidden = !blend || $('overlayLut').value !== 'gray';
    $('grayNote').hidden = blend;
    canvases.r.parentElement.classList.toggle('reveal-active', state.display === 'window');
    updateButtons();
    requestRender();
  })
);
$('resultSlab').addEventListener('change', requestRender);
$('windowSize').addEventListener('input', e => {
  $('windowSizeValue').textContent = e.target.value + '%';
  requestRender();
});
$('overlayLut').addEventListener('change', () => {
  $('overlaySliceControl').hidden = $('overlayLut').value !== 'gray';
  updateButtons();
  requestRender();
});
$('overlaySlice').addEventListener('input', e => {
  state.overlaySlice = Number(e.target.value);
  configureOverlaySlice();
  requestRender();
});
$('fusionOpacity').addEventListener('input', e => {
  $('fusionOpacityValue').textContent = e.target.value + '%';
  requestRender();
});
$('fusionThreshold').addEventListener('input', e => {
  $('fusionThresholdValue').textContent = e.target.value + '%';
  requestRender();
});
$('fusionVariableAlpha').addEventListener('change', e => {
  $('fusionThreshold').disabled = !e.target.checked;
  requestRender();
});
for (const id of ['sign', 'palette']) $(id).addEventListener('input', requestRender);
$('sliceSlider').addEventListener('input', e => {
  state.slice = Number(e.target.value);
  configureSlice();
  requestRender();
});
$('prevSlice').addEventListener('click', () => stepSlice(-1));
$('nextSlice').addEventListener('click', () => stepSlice(1));
$('fitBtn').addEventListener('click', () => {
  state.zoom = 1;
  requestRender();
});
$('registerBtn').addEventListener('click', startRegistration);
$('resetTransform').addEventListener('click', () => {
  resetRegistration();
  requestRender();
});
$('demoBtn').addEventListener('click', demo);
$('clearBtn').addEventListener('click', () => clearAll());
$('exportTransform').addEventListener('click', exportTransform);
$('exportNifti').addEventListener('click', exportNifti);
$('exportOverlayDicom').addEventListener('click', exportOverlayDicom);
$('exportPng').addEventListener('click', () => {
  render();
  canvases.r.toBlob(blob => {
    if (blob) saveBlob(blob, 'subtract-' + state.plane + '-' + (state.slice + 1) + '.png');
  });
});
$('helpBtn').addEventListener('click', () => $('helpDialog').showModal());
$('closeHelp').addEventListener('click', () => $('helpDialog').close());
$('closeSeries').addEventListener('click', cancelScan);
$('seriesDialog').addEventListener('cancel', cancelScan);
$('closeDownload').addEventListener('click', () => $('downloadDialog').close());
for (const key of ['a', 'b', 'r']) {
  const wrap = canvases[key].parentElement;
  wrap.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1 : -1;
      if (key === 'r' && state.display === 'blend' && $('overlayLut').value === 'gray')
        stepOverlaySlice(delta);
      else stepSlice(delta);
    },
    { passive: false }
  );
  let drag = null;
  const moveWindow = e => {
    if (key !== 'r' || state.display !== 'window' || !(state.a && state.b)) return;
    const canvas = canvases.r,
      rect = canvas.getBoundingClientRect();
    state.reveal = pointerToImage(
      ((e.clientX - rect.left) * canvas.width) / rect.width,
      ((e.clientY - rect.top) * canvas.height) / rect.height,
      canvas,
      planeInfo(state.a),
      state.zoom
    );
    requestRender();
  };
  wrap.addEventListener('pointerdown', e => {
    if (!(state.a || state.b)) return;
    if (key === 'r' && $('manualMode').checked && state.a && state.b && !e.shiftKey) {
      const canvas = canvases.r,
        rect = canvas.getBoundingClientRect(),
        start = {
          x: ((e.clientX - rect.left) * canvas.width) / rect.width,
          y: ((e.clientY - rect.top) * canvas.height) / rect.height
        };
      const corner = !!e.target.closest('[data-rotate-handle]');
      const centreBounds = imageBounds(canvas, planeInfo(state.a), state.zoom);
      drag = {
        manual: true,
        rotation: corner,
        centre: { x: centreBounds.x + centreBounds.w / 2, y: centreBounds.y + centreBounds.h / 2 },
        start,
        params: [...state.params],
        canvasSize: { width: canvas.width, height: canvas.height },
        plane: planeInfo(state.a),
        zoom: state.zoom,
        pointerId: e.pointerId,
        changed: false
      };
      manualExtent = viewExtent();
      stopResampling();
      state.manualDragging = true;
      updateButtons();
      wrap.setPointerCapture(e.pointerId);
      return;
    }
    drag = {
      x: e.clientX,
      y: e.clientY,
      wl: state.windows[key]?.level,
      ww: state.windows[key]?.width,
      zoom: state.zoom,
      shift: e.shiftKey,
      pointerId: e.pointerId
    };
    wrap.setPointerCapture(e.pointerId);
    if (!e.shiftKey) moveWindow(e);
  });
  wrap.addEventListener('pointermove', e => {
    if (drag?.manual) {
      if (drag.pointerId !== e.pointerId || !state.manualDragging) return;
      const canvas = canvases.r,
        rect = canvas.getBoundingClientRect(),
        end = {
          x: ((e.clientX - rect.left) * canvas.width) / rect.width,
          y: ((e.clientY - rect.top) * canvas.height) / rect.height
        };
      if (drag.rotation) {
        const degrees = rotationDragDegrees(drag.start, end, drag.centre);
        state.params = rotateInPlane(drag.params, drag.plane, degrees);
        drag.changed = drag.changed || Math.abs(degrees) > 0;
      } else {
        state.params = dragTranslation(
          drag.params,
          drag.start,
          end,
          drag.canvasSize,
          drag.plane,
          drag.zoom
        );
        drag.changed = drag.changed || Math.hypot(end.x - drag.start.x, end.y - drag.start.y) > 0;
      }
      requestRender();
      return;
    }
    if (
      key === 'r' &&
      state.display === 'window' &&
      !$('manualMode').checked &&
      !e.shiftKey &&
      (e.pointerType === 'mouse' || drag)
    )
      moveWindow(e);
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (drag.shift) {
      state.zoom = clamp(drag.zoom * Math.exp(-dy * 0.008), 0.2, 6);
    } else if (key !== 'r' && state[key]) {
      const step = Math.max(1, state[key].stats.width) / 250;
      state.windows[key] = { level: drag.wl + dy * step, width: Math.max(1, drag.ww + dx * step) };
      $('wl' + key.toUpperCase()).value = Math.round(state.windows[key].level);
      $('ww' + key.toUpperCase()).value = Math.round(state.windows[key].width);
    }
    requestRender();
  });
  wrap.addEventListener('pointerup', e => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.manual && state.manualDragging) {
      state.manualDragging = false;
      if (drag.changed) invalidateRegistration();
      configureSlice();
      updateWarnings();
      scheduleResampling();
      updateButtons();
    }
    drag = null;
  });
  wrap.addEventListener('pointercancel', e => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.manual && state.manualDragging) {
      state.params = drag.params;
      state.manualDragging = false;
      configureSlice();
      updateWarnings();
      scheduleResampling();
      updateButtons();
    }
    drag = null;
  });
}
document.addEventListener('keydown', e => {
  if (
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) ||
    document.querySelector('dialog[open]')
  )
    return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    stepSlice(e.key === 'ArrowUp' ? -1 : 1);
  }
});
new ResizeObserver(requestRender).observe(document.querySelector('.viewers'));
// A labelled synthetic pair makes all controls testable before importing real data.
demo();
