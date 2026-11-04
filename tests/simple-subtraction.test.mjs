import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compactSource } from './source-assertions.mjs';
import { difference, windowValue } from '../dist/core.mjs';
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const rawApp = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
const rawRenderer = readFileSync(new URL('../dist/renderer.mjs', import.meta.url), 'utf8');
const rawExports = readFileSync(new URL('../dist/export-actions.mjs', import.meta.url), 'utf8');
const app = compactSource(rawApp + rawRenderer + rawExports);
const nifti = readFileSync(new URL('../dist/nifti.mjs', import.meta.url), 'utf8');
const localization = readFileSync(new URL('../dist/localization.mjs', import.meta.url), 'utf8');

test('signed window-normalized subtraction has no weight, raw or gain controls', () => {
  for (const id of ['weight', 'resultGain', 'rawScale', 'subtractionMode']) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`));
    assert.doesNotMatch(app, new RegExp(`\\$\\('${id}'\\)`));
  }
  assert.match(html, /id="sign"/);
  assert.match(html, /id="palette"/);
  assert.equal(difference.length, 4);
  assert.equal(
    difference(300, 250, { level: 300, width: 201 }, { level: 300, width: 201 }),
    windowValue(300, 300, 201) - windowValue(250, 300, 201)
  );
});
test('fusion retains its own independent opacity control', () => {
  const controls = html.match(/<div class="fusion-controls"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(controls);
  assert.match(controls, /id="fusionOpacity"/);
  assert.match(app, /\$\('fusionOpacity'\)\.value/);
  assert.doesNotMatch(app, /fusionOpacity=clamp\(gain/);
});
test('NIfTI stores the same signed normalized difference, without display averaging', () => {
  assert.match(
    app,
    /config\.sign\*difference\(a\.data\[i\],bOnA\.data\[i\],config\.windows\.a,config\.windows\.b\)/
  );
  assert.doesNotMatch(
    rawExports.match(/async function exportNifti\(\)[\s\S]*?\n\s*\}/)?.[0] || '',
    /averageResultSlab|resultSlab|fusionOpacity/
  );
  assert.doesNotMatch(nifti, /A-kB|after DICOM rescale/);
  assert.doesNotMatch(html, /Для численного анализа выбери исходные интенсивности|без усиления/);
  assert.doesNotMatch(
    localization,
    /Для численного анализа выбери исходные интенсивности|A − k·B|без усиления и палитры/
  );
});
