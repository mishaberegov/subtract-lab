import {
  clamp,
  difference,
  mapped,
  sample,
  samplingMap,
  windowValue
} from './core.mjs?v=1.1.9-simple1';
import { planeMapping } from './orientation.mjs';
import { imageBounds, isRevealed } from './comparison-window.mjs';
import { fusionColor, fusionAlpha, composeFusion } from './fusion.mjs?v=1.2.0-overlay1';
import { createBGridOverlay } from './overlay-b.mjs?v=1.2.0-overlay1';
import { averageResultSlab } from './result-slab.mjs?v=1.1.8-slab1';

// Canvas buffers belong to the renderer; navigation and transforms remain in the controller.
export function createRenderer({ state, canvases, element: $, planeInfo, format }) {
  const offscreen = {};
  for (const key of ['a', 'b', 'r', 'fusion']) offscreen[key] = document.createElement('canvas');
  function orientationLabel(direction) {
    const names = [
      ['R', 'L'],
      ['A', 'P'],
      ['I', 'S']
    ];
    return direction
      .map((v, i) => ({ v: Math.abs(v), s: names[i][v >= 0 ? 1 : 0] }))
      .filter(o => o.v > Math.max(...direction.map(Math.abs)) * 0.2)
      .sort((a, b) => b.v - a.v)
      .map(o => o.s)
      .join('');
  }
  function positionRotationHandles(canvas, bounds) {
    for (const handle of document.querySelectorAll('[data-rotate-handle]')) {
      const corner = handle.dataset.rotateHandle;
      const x = corner.endsWith('l') ? bounds.x + 18 : bounds.x + bounds.w - 18;
      const y = corner.startsWith('t') ? bounds.y + 18 : bounds.y + bounds.h - 18;
      handle.style.left = clamp((x / canvas.width) * 100, 5, 95) + '%';
      handle.style.top = clamp((y / canvas.height) * 100, 5, 95) + '%';
    }
  }
  function render() {
    const base = state.a || state.b;
    for (const key of ['a', 'b', 'r']) {
      const canvas = canvases[key],
        wrap = canvas.parentElement,
        dpr = Math.min(devicePixelRatio || 1, 2),
        width = Math.round(wrap.clientWidth * dpr),
        height = Math.round(wrap.clientHeight * dpr);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = key === 'r' ? '#090909' : '#090c0e';
      ctx.fillRect(0, 0, width, height);
      wrap.querySelector('.empty-view').hidden =
        key === 'r' ? !!(state.a && state.b) : key === 'a' ? !!state.a : !!state.b;
      wrap
        .querySelectorAll('.orientation,.canvas-corner,.scale-mark')
        .forEach(
          e =>
            (e.style.visibility =
              base && (key === 'r' ? state.a && state.b : state[key]) ? 'visible' : 'hidden')
        );
    }
    if (!base) return;
    const pi = planeInfo(base),
      [nx, ny] = base.dims,
      map = state.a && state.b ? samplingMap(state.a, state.b, state.params) : null;
    const images = {};
    for (const key of ['a', 'b', 'r']) {
      offscreen[key].width = pi.w;
      offscreen[key].height = pi.h;
      images[key] = offscreen[key].getContext('2d').createImageData(pi.w, pi.h);
    }
    const grayPreview = !!(
      state.a &&
      state.b &&
      state.display === 'blend' &&
      $('overlayLut').value === 'gray'
    );
    if (state.display === 'blend' && !grayPreview) {
      offscreen.fusion.width = pi.w;
      offscreen.fusion.height = pi.h;
      images.fusion = offscreen.fusion.getContext('2d').createImageData(pi.w, pi.h);
    }
    const sign = Number($('sign').value),
      palette = $('palette').value,
      windowSize = Number($('windowSize').value) / 100;
    const fusionOpacity = Number($('fusionOpacity').value) / 100,
      fusionThreshold = Number($('fusionThreshold').value) / 100,
      variableAlpha = $('fusionVariableAlpha').checked,
      slabCount = Number($('resultSlab').value);
    const readResult = q => {
      const i = (q[2] * ny + q[1]) * nx + q[0],
        a = state.a.data[i],
        b =
          state.manualDragging || !state.bOnA
            ? sample(state.b, ...mapped(map, ...q))
            : state.bOnA.data[i];
      return sign * difference(a, b, state.windows.a, state.windows.b);
    };
    for (let v = 0; v < pi.h; v++)
      for (let u = 0; u < pi.w; u++) {
        const p = pi.voxel(u, v),
          i = (v * pi.w + u) * 4,
          insideA = !!state.a && p.every((v, i) => v >= 0 && v < state.a.dims[i]),
          ai = (p[2] * ny + p[1]) * nx + p[0],
          av = insideA ? state.a.data[ai] : NaN,
          bv = state.b
            ? state.a
              ? state.manualDragging
                ? sample(state.b, ...mapped(map, ...p))
                : insideA && state.bOnA
                  ? state.bOnA.data[ai]
                  : sample(state.b, ...mapped(map, ...p))
              : state.b.data[ai]
            : NaN;
        const wa = windowValue(av, state.windows.a.level, state.windows.a.width),
          wb = windowValue(bv, state.windows.b.level, state.windows.b.width);
        for (const [key, value] of [
          ['a', wa],
          ['b', wb]
        ]) {
          const d = images[key].data,
            g = Number.isFinite(value) ? Math.round(value * 255) : 9;
          d[i] = d[i + 1] = d[i + 2] = g;
          d[i + 3] = 255;
        }
        const d = images.r.data;
        d[i + 3] = 255;
        if (grayPreview) continue;
        if (state.display === 'window') {
          const inside = isRevealed(u, v, pi.w, pi.h, state.reveal, windowSize),
            value = inside ? wb : wa;
          const g = Number.isFinite(value)
            ? Math.round(value * 255)
            : ((u >> 3) + (v >> 3)) % 2
              ? 13
              : 18;
          d[i] = d[i + 1] = d[i + 2] = g;
          continue;
        }
        if (!Number.isFinite(av) || !Number.isFinite(bv)) {
          const c = ((u >> 3) + (v >> 3)) % 2 ? 13 : 18;
          d[i] = d[i + 1] = d[i + 2] = c;
          if (images.fusion) {
            const overlay = images.fusion.data;
            overlay[i] = overlay[i + 1] = overlay[i + 2] = c;
            overlay[i + 3] = 255;
          }
          continue;
        }
        if (state.display === 'blend') {
          const rgb = composeFusion(wa, wb, fusionOpacity, fusionThreshold, variableAlpha);
          d[i] = rgb[0];
          d[i + 1] = rgb[1];
          d[i + 2] = rgb[2];
          const color = fusionColor(wb),
            overlay = images.fusion.data,
            alpha = fusionAlpha(wb, fusionOpacity, fusionThreshold, variableAlpha);
          overlay[i] = color[0];
          overlay[i + 1] = color[1];
          overlay[i + 2] = color[2];
          overlay[i + 3] = Math.round(alpha * 255);
        } else {
          const delta =
              state.display === 'difference' && slabCount > 1
                ? averageResultSlab(p, pi.normalAxis, state.a.dims, slabCount, readResult)
                : sign * difference(av, bv, state.windows.a, state.windows.b),
            t = clamp(delta, -1, 1);
          const g = palette === 'absolute' ? Math.abs(t) * 255 : (t + 1) * 127.5;
          d[i] = d[i + 1] = d[i + 2] = g;
        }
      }
    let resultPi = pi;
    if (grayPreview) {
      resultPi = planeMapping(state.b, state.plane, state.overlaySlice);
      offscreen.r.width = resultPi.w;
      offscreen.r.height = resultPi.h;
      const preview = offscreen.r.getContext('2d').createImageData(resultPi.w, resultPi.h);
      const overlay = createBGridOverlay(state.a, state.b, state.params, {
        windows: state.windows,
        opacity: fusionOpacity,
        threshold: fusionThreshold,
        variableAlpha
      });
      for (let v = 0; v < resultPi.h; v++)
        for (let u = 0; u < resultPi.w; u++) {
          const q = resultPi.voxel(u, v),
            g = overlay.at(...q),
            i = (v * resultPi.w + u) * 4;
          preview.data[i] = preview.data[i + 1] = preview.data[i + 2] = g;
          preview.data[i + 3] = 255;
        }
      images.r = preview;
    }
    if (images.fusion) offscreen.fusion.getContext('2d').putImageData(images.fusion, 0, 0);
    if (base)
      positionRotationHandles(canvases.r, imageBounds(canvases.r, planeInfo(base), state.zoom));
    for (const key of ['a', 'b', 'r']) {
      const canvas = canvases[key],
        ctx = canvas.getContext('2d'),
        off = offscreen[key];
      if (
        (key === 'a' && !state.a) ||
        (key === 'b' && !state.b) ||
        (key === 'r' && !(state.a && state.b))
      )
        continue;
      off.getContext('2d').putImageData(images[key], 0, 0);
      const plane = key === 'r' ? resultPi : pi,
        bounds = imageBounds(canvas, plane, state.zoom);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(off, bounds.x, bounds.y, bounds.w, bounds.h);
      for (const [label, axis] of [
        ['Top', plane.v.map(x => -x)],
        ['Bottom', plane.v],
        ['Left', plane.u.map(x => -x)],
        ['Right', plane.u]
      ])
        $(key + label).textContent = orientationLabel(axis);
      if (key !== 'r')
        $('info' + key.toUpperCase()).textContent =
          pi.w + ' × ' + pi.h + '\n' + format(pi.sx, 2) + ' × ' + format(pi.sy, 2) + ' mm';
    }

    $('grayNote').textContent =
      palette === 'absolute'
        ? 'Модуль разницы: ноль — чёрный.'
        : 'Нулевая разница — средний серый.';
  }
  return render;
}
