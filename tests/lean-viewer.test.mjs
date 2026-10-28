import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');

test('workspace has no redundant loaded-state, technical tagline or scope footer',()=>{
  assert.doesNotMatch(html,/id="workspaceStatus"|class="bottom-info"|class="scope-note"/);
  assert.doesNotMatch(app,/\$\('workspaceStatus'\)|\$\('readyDot'\)/);
});

test('result image has no gray-scale legend or normalization annotation',()=>{
  const result=html.match(/<section class="viewport result-viewport"[\s\S]*?<\/section>/)?.[0];
  assert.ok(result);
  assert.doesNotMatch(result,/class="signed-legend"|id="legend"|id="infoR"/);
  assert.doesNotMatch(app,/\$\('legend'\)|\$\('infoR'\)/);
  assert.match(html,/id="infoA"/);
  assert.match(html,/id="infoB"/);
});