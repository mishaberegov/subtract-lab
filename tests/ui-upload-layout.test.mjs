import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../dist/viewer-layout.css',import.meta.url),'utf8');

test('A and B load targets and pickers live inside their image viewports',()=>{
  const sidebar=html.match(/<aside class="sidebar">([\s\S]*?)<\/aside>/)?.[1]||'';
  assert.doesNotMatch(sidebar,/id="drop[AB]"|data-pick=/);
  for(const slot of ['A','B']){
    const panel=html.match(new RegExp(`<section class="viewport[^>]*id="drop${slot}"([\\s\\S]*?)<\\/section>`))?.[1];
    assert.ok(panel,`missing panel ${slot}`);
    assert.match(panel,new RegExp(`id="canvas${slot}"`));
    assert.match(panel,new RegExp(`data-pick="${slot.toLowerCase()}" data-kind="folder"`));
    assert.match(panel,new RegExp(`data-pick="${slot.toLowerCase()}" data-kind="files"`));
  }
});

test('image viewers use full workspace width rather than a fixed left sidebar',()=>{
  assert.match(css,/\.app-shell\{display:flex;flex-direction:column/);
});

test('main heading is direct, without brand slogan or trailing dot',()=>{
  assert.doesNotMatch(html,/class="brand"|РАЗНИЦА СТАНОВИТСЯ ВИДНОЙ/);
  assert.match(html,/<header class="app-header">[\s\S]*?<h1>Корегистрация и вычитание<\/h1>/);
  assert.doesNotMatch(html,/Две серии\. Одна система координат\. Независимые окна\./);
});
