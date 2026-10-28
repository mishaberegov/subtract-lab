import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {languageFromUrl,languageUrl,translate,staticEnglish,localizeMessage,copy} from '../dist/localization.mjs';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');

test('English is default and only lang=ru selects Russian',()=>{
  assert.equal(languageFromUrl('https://example.org/subtract-lab/?foo=1'),'en');
  assert.equal(languageFromUrl('https://example.org/subtract-lab/?lang=ru'),'ru');
  assert.equal(languageFromUrl('https://example.org/?lang=de'),'en');
});
test('switch links retain path, query parameters and fragment',()=>{
  assert.equal(languageUrl('https://example.org/subtract-lab/?case=abc&lang=ru#images','en'),'/subtract-lab/?case=abc#images');
  assert.equal(languageUrl('https://example.org/subtract-lab/?case=abc#images','ru'),'/subtract-lab/?case=abc&lang=ru#images');
});
test('static strings and dynamic status/error messages translate without altering identifiers',()=>{
  assert.equal(staticEnglish('Референс'),'Fixed');
  assert.equal(staticEnglish('Совмещаемая серия'),'Moving');
  assert.equal(translate('Сначала загрузи две серии','en'),'Load two series first');
  assert.equal(translate('Сначала загрузи две серии','ru'),'Сначала загрузи две серии');
  assert.equal(localizeMessage('Чтение DICOM · 45%','en'),'Reading DICOM · 45%');
  assert.equal(localizeMessage('Transfer Syntax 1.2.840.10008 пока не поддерживается. Экспортируй DICOM без сжатия.','en'),'Transfer Syntax 1.2.840.10008 is not supported yet. Export uncompressed DICOM.');
});
test('visible language control and corrected geometry and reset zoom labels exist',()=>{
  assert.match(html,/id="languageSwitch"/);
  assert.match(html,/A · РЕФЕРЕНС<\/small>/);
  assert.match(html,/B · СОВМЕЩАЕМАЯ СЕРИЯ<\/small>/);
  assert.match(html,/<strong>Совмещаемая серия<\/strong>/);
  assert.doesNotMatch(html,/ИСХОДНАЯ · ВОКСЕЛЬ|РЕФЕРЕНС · ВОКСЕЛЬ/);
  assert.match(html,/id="fitBtn"[^>]*title="Сбросить масштаб"/);
  assert.match(app,/state\.zoom=1;requestRender\(\)/);
});
test('title shares header row, and demo has a compact marker near series instead of a full-width notice',()=>{
  const header=html.match(/<header class="app-header">([\s\S]*?)<\/header>/)?.[1]||'';
  assert.match(header,/<h1>/);
  assert.doesNotMatch(html,/class="workspace-heading"/);
  assert.match(html,/<div class="viewer-toolbar">[\s\S]*?id="demoBtn"/);
  assert.doesNotMatch(html,/class="notice demo-notice"/);
  assert.match(html,/id="demoMarker"/);
  assert.match(html,/id="demoMarker"[^>]*title="Синтетические данные"[^>]*>Демо<\/span>/);
  assert.equal(staticEnglish('Синтетические данные'),'Synthetic data');
  assert.match(html,/id="clearBtn"/);
  assert.match(readFileSync(new URL('../dist/viewer-layout.css',import.meta.url),'utf8'),/\.language-switch/);
});
test('every Russian static text and accessible attribute has an English counterpart',()=>{
  const texts=[...html.matchAll(/>([^<>]+)</g)].map(m=>m[1].trim()).filter(s=>/[А-Яа-яЁё]/.test(s));
  const attrs=[...html.matchAll(/(?:title|aria-label|content)="([^"]+)"/g)].map(m=>m[1]).filter(s=>/[А-Яа-яЁё]/.test(s));
  assert.deepEqual([...new Set([...texts,...attrs].filter(s=>!copy[s]))],[]);
});
test('demo names and geometry use localized labels and units without translating real series names',()=>{
  assert.equal(translate('Фантом · до','en'),'Phantom · before');
  assert.equal(translate('Фантом · после','en'),'Phantom · after');
  assert.match(app,/label\.textContent=volume\.synthetic\?'':volume\.name/);
  assert.match(app,/root\.dataset\.patientName==='true'/);
  assert.match(app,/['"]gridA['"],['"]gridB['"],['"]gridTarget['"]/);
});
test('gain readout uses selected numeric locale rather than a fixed decimal point',()=>{
  assert.match(app,/format\(Number\(\$\('resultGain'\)\.value\),1\)/);
});
test('language changes do not silently discard loaded patient series',()=>{
  assert.match(app,/state\.a\?\.synthetic/);
  assert.match(app,/state\.b\?\.synthetic/);
  assert.match(app,/confirm\(/);
  assert.match(app,/event\.preventDefault\(\)/);
});
