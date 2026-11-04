import test from 'node:test';
import assert from 'node:assert/strict';
import { baseCopy } from '../dist/localization-ui.mjs';
import { addMessageCopy } from '../dist/localization-messages.mjs';
import { copy } from '../dist/localization.mjs';

test('localized UI and runtime messages share the existing public dictionary', () => {
  const combined = { ...baseCopy };
  addMessageCopy(combined);
  assert.deepEqual(copy, combined);
});
