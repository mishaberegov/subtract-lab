import test from 'node:test';
import assert from 'node:assert/strict';
import { createExportActions } from '../dist/export-actions.mjs';
import { gunzipSync } from 'node:zlib';

test('export workflows are encapsulated behind an action factory', () => {
  assert.equal(typeof createExportActions, 'function');
});

test('UI export actions preserve transform metadata and unaveraged A-grid differences', async () => {
  const dims = [2, 2, 3];
  const a = {
    dims,
    origin: [0, 0, 0],
    matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    data: Float32Array.from({ length: 12 }, () => 400),
    name: 'Synthetic A',
    modality: 'MR'
  };
  const b = { ...a, name: 'Synthetic B' };
  const state = {
    a,
    b,
    bOnA: { data: Float32Array.from({ length: 12 }, () => 300) },
    params: [0, 0, 0, 0, 0, 0],
    windows: { a: { level: 500, width: 1000 }, b: { level: 500, width: 1000 } },
    registration: null,
    demo: true,
    regWorker: null,
    resampleBusy: false
  };
  const elements = new Map();
  const element = id => {
    if (!elements.has(id))
      elements.set(id, {
        value: id === 'sign' ? '1' : '',
        innerHTML: '',
        showModal() {
          this.open = true;
        }
      });
    return elements.get(id);
  };
  let saved;
  const actions = createExportActions({
    state,
    element,
    language: 'en',
    toast: message => {
      throw Error(message);
    },
    updateButtons: () => {},
    saveBlob: (blob, name) => {
      saved = { blob, name };
    }
  });
  actions.exportTransform();
  const json = JSON.parse(await saved.blob.text());
  assert.equal(saved.name, 'subtract-transform.json');
  assert.deepEqual(json.matrixAtoB4x4, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  assert.equal(json.reference.name, 'Synthetic A');
  assert.equal(json.moving.name, 'Synthetic B');

  const originalCreate = URL.createObjectURL;
  let niftiBlob;
  URL.createObjectURL = blob => {
    niftiBlob = blob;
    return 'blob:synthetic';
  };
  try {
    await actions.exportNifti();
  } finally {
    URL.createObjectURL = originalCreate;
  }
  assert.equal(element('downloadDialog').open, true);
  const bytes = new Uint8Array(await niftiBlob.arrayBuffer());
  const payload = element('niftiDownloadLink').download.endsWith('.gz') ? gunzipSync(bytes) : bytes;
  const floats = new Float32Array(payload.buffer, payload.byteOffset + 352, 12);
  for (const value of floats) assert.ok(Math.abs(value - 100 / 999) < 1e-6);
});
