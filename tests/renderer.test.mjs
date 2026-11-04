import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../dist/renderer.mjs';

test('viewer rendering is encapsulated behind a renderer factory', () => {
  assert.equal(typeof createRenderer, 'function');
});
