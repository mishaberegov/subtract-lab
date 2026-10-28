import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');

test('slice navigation shows slice number without patient LPS coordinates',()=>{
  assert.doesNotMatch(html,/id="positionLabel"/);
  assert.doesNotMatch(app,/\$\('positionLabel'\)/);
  assert.match(html,/id="sliceNumber"/);
});

test('processing section headings do not have numeric step badges',()=>{
  assert.doesNotMatch(html,/class="step"/);
  assert.match(html,/Совмещение/);
  assert.match(html,/Вычитание/);
});
