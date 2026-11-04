import test from 'node:test';
import assert from 'node:assert/strict';
import { rotationDragDegrees } from '../dist/manual-alignment.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { compactCss, uiSource } from './source-assertions.mjs';

test('corner dragging computes signed in-plane rotation around image centre', () => {
  const center = { x: 100, y: 100 };
  assert.equal(rotationDragDegrees({ x: 50, y: 50 }, { x: 150, y: 50 }, center), 90);
  assert.equal(rotationDragDegrees({ x: 150, y: 50 }, { x: 50, y: 50 }, center), -90);
  assert.equal(rotationDragDegrees({ x: 50, y: 50 }, { x: 50, y: 50 }, center), 0);
});
test('four explicit rotation handles are shown only in manual mode and use the rigid pose', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const rendererPath = new URL('../dist/renderer.mjs', import.meta.url);
  const app = uiSource(
    readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8'),
    existsSync(rendererPath) ? readFileSync(rendererPath, 'utf8') : ''
  );
  assert.equal((html.match(/data-rotate-handle=/g) || []).length, 4);
  assert.match(app, /rotationDragDegrees\(/);
  assert.match(app, /rotateInPlane\(drag\.params,drag\.plane,degrees\)/);
  assert.match(
    app,
    /state\.manualDragging\|\|!state\.bOnA\?sample\(state\.b,\.\.\.mapped\(map,\.\.\.q\)\):state\.bOnA\.data\[i\]/
  );
  const css = compactCss(
    readFileSync(new URL('../dist/viewer-layout.css', import.meta.url), 'utf8')
  );
  assert.match(css, /\.rotation-handle\{[^}]*cursor:url\(['"]data:image\/svg\+xml,/);
});
