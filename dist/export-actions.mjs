import { center, difference, rotation } from './core.mjs?v=1.1.9-simple1';
import { makeNiftiHeader } from './nifti.mjs?v=1.1.9-simple1';
import { createBGridOverlay } from './overlay-b.mjs?v=1.2.0-overlay1';
import { createOverlayDicomZipAsync } from './overlay-dicom.mjs?v=1.2.0-overlay2';
import { translate } from './localization.mjs?v=1.2.0-readable1';

// Export actions read the same live application state as the UI, but own their
// download lifecycle. NIfTI and derived DICOM deliberately use different grids.
export function createExportActions({
  state,
  element: $,
  language,
  toast,
  updateButtons,
  saveBlob
}) {
  let niftiUrl = null;
  function settings() {
    return {
      mode: 'windowed',
      sign: Number($('sign').value),
      windows: structuredClone(state.windows),
      resampling: state.bOnA?.resampling || null
    };
  }
  function exportTransform() {
    if (!(state.a && state.b)) return;
    const r = rotation(state.params),
      c = center(state.a),
      rc = [
        r[0] * c[0] + r[1] * c[1] + r[2] * c[2],
        r[3] * c[0] + r[4] * c[1] + r[5] * c[2],
        r[6] * c[0] + r[7] * c[1] + r[8] * c[2]
      ],
      t = c.map((v, i) => v - rc[i] + state.params[i]);
    const meta = v => ({
      name: v.name,
      dims: v.dims,
      originLPS: v.origin,
      voxelToLPS3x3: v.matrix,
      frameOfReferenceUID: v.frameUID,
      modality: v.modality,
      sliceThicknessMm: v.sliceThicknessMm ?? null
    });
    const payload = {
      format: 'subtract-lab-transform-v1',
      createdAt: new Date().toISOString(),
      coordinateSystem: 'DICOM LPS, millimetres',
      mapping: 'fixed A patient coordinate -> moving B patient coordinate; resample B on A',
      parameters: {
        translationLPSmm: state.params.slice(0, 3),
        rotationXYZdegrees: state.params.slice(3),
        rotationOrder: 'Rz * Ry * Rx',
        rotationCenterLPSmm: c
      },
      matrixAtoB4x4: [
        ...r.slice(0, 3),
        t[0],
        ...r.slice(3, 6),
        t[1],
        ...r.slice(6),
        t[2],
        0,
        0,
        0,
        1
      ],
      reference: meta(state.a),
      moving: meta(state.b),
      subtraction: settings(),
      registration: state.registration,
      syntheticDemo: state.demo
    };
    saveBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      'subtract-transform.json'
    );
  }
  async function exportNifti() {
    if (!(state.a && state.b && state.bOnA) || state.regWorker || state.resampleBusy) return;
    const button = $('exportNifti'),
      old = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Экспорт…';
    try {
      const { a, bOnA } = state,
        [nx, ny, nz] = a.dims,
        config = settings(),
        n = a.data.length;
      if (n > 60000000) throw Error('Экспорт ограничен 60 млн вокселей в этой версии.');
      const header = makeNiftiHeader(a);
      const output = new Float32Array(n);
      for (let z = 0; z < nz; z++) {
        for (let y = 0; y < ny; y++)
          for (let x = 0; x < nx; x++) {
            const i = (z * ny + y) * nx + x;
            output[i] =
              config.sign * difference(a.data[i], bOnA.data[i], config.windows.a, config.windows.b);
          }
        if (z % 4 === 0) {
          button.textContent = Math.round(((z + 1) / nz) * 100) + '%';
          await new Promise(r => setTimeout(r, 0));
        }
      }
      let blob = new Blob([header, output], { type: 'application/octet-stream' }),
        filename = 'subtract-' + config.mode + '.nii';
      if (typeof CompressionStream !== 'undefined') {
        button.textContent = 'Сжатие…';
        blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
        blob = new Blob([blob], { type: 'application/gzip' });
        filename += '.gz';
      }
      if (niftiUrl) URL.revokeObjectURL(niftiUrl);
      niftiUrl = URL.createObjectURL(blob);
      $('niftiDownloadLink').href = niftiUrl;
      $('niftiDownloadLink').download = filename;
      $('downloadDialog').showModal();
    } catch (e) {
      toast(e.message || String(e), true);
    } finally {
      button.innerHTML = old;
      updateButtons();
    }
  }
  async function exportOverlayDicom() {
    if ($('exportOverlayDicom').disabled) return;
    const button = $('exportOverlayDicom'),
      old = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Экспорт DICOM…';
    try {
      const b = state.b,
        overlay = createBGridOverlay(state.a, b, [...state.params], {
          windows: structuredClone(state.windows),
          opacity: Number($('fusionOpacity').value) / 100,
          threshold: Number($('fusionThreshold').value) / 100,
          variableAlpha: $('fusionVariableAlpha').checked
        });
      const blob = await createOverlayDicomZipAsync({
        volume: b,
        study: b.study,
        renderSlice: z => overlay.slice(z),
        onProgress: (completed, total) => {
          button.textContent =
            translate('DICOM · наложение', language) +
            ' · ' +
            Math.round((completed / total) * 100) +
            '%';
        }
      });
      saveBlob(blob, 'subtract-overlay-b.zip');
    } catch (e) {
      toast(e.message || String(e), true);
    } finally {
      button.innerHTML = old;
      updateButtons();
    }
  }
  return { exportTransform, exportNifti, exportOverlayDicom };
}
