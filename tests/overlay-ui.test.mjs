import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { uiSource } from './source-assertions.mjs';
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const rendererPath = new URL('../dist/renderer.mjs', import.meta.url);
const app = uiSource(
  readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8'),
  (existsSync(rendererPath) ? readFileSync(rendererPath, 'utf8') : '') +
    readFileSync(new URL('../dist/export-actions.mjs', import.meta.url), 'utf8')
);

test('result viewport offers a Boojum/grayscale LUT choice only for overlay', () => {
  assert.match(html, /id="overlayLut"/);
  assert.match(html, /value="boojum"/);
  assert.match(html, /value="gray"/);
  assert.match(app, /overlayLut.*hidden/);
});
test('grayscale preview and DICOM export use the same B-grid overlay sampler', () => {
  assert.match(app, /createBGridOverlay\(/);
  assert.match(app, /overlay\.at\(/);
  assert.match(app, /overlay\.slice\(/);
  assert.match(html, /id="overlaySlice"/);
  assert.match(html, /id="exportOverlayDicom"/);
});
test('wheel over grayscale B-grid result advances the B preview slice rather than only A', () => {
  assert.match(app, /function stepOverlaySlice\(delta\)/);
  assert.match(
    app,
    /wrap\.addEventListener\('wheel',e=>\{[^}]*if\(key==='r'&&state\.display==='blend'&&\$\('overlayLut'\)\.value==='gray'\)stepOverlaySlice\(delta\);else stepSlice\(delta\)/
  );
});

test('DICOM export is disabled for synthetic demo and B without study provenance', () => {
  assert.match(app, /state\.b\?\.study\?\.studyUID/);
  assert.match(app, /state\.b\?\.frameUID/);
});
