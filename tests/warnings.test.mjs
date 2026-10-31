import test from 'node:test';
import assert from 'node:assert/strict';
import {formatWarningLines} from '../dist/warnings.mjs';
import {localizeMessage} from '../dist/localization.mjs';
import {readFileSync} from 'node:fs';

const sizeA='Большой объём: разрешение в плоскости уменьшено в 2 раза (до 256×256×319); исходные срезы по оси Z сохранены.';
const sizeB='Большой объём: разрешение в плоскости уменьшено в 2 раза (до 256×256×719); исходные срезы по оси Z сохранены.';
const half='Значения конвертированы в Float16 (погрешность до 1 HU).';
const seam='Две последовательные съёмки перекрываются на одном срезе. Один граничный срез исключён.';

test('warning lines attribute repeated notices and seam to the correct A or B volume',()=>{
  const a={warnings:[sizeA,half],frameUID:'1'};
  const b={warnings:[sizeB,half,seam],frameUID:'2'};
  assert.deepEqual(formatWarningLines(a,b),[
    'Серия A. '+sizeA+' '+half,
    'Серия B. '+sizeB+' '+half+' '+seam
  ]);
});

test('single series and demo have no spurious pair warning',()=>{
  assert.deepEqual(formatWarningLines(null,{warnings:[seam],frameUID:'2'}),['Серия B. '+seam]);
  assert.deepEqual(formatWarningLines({warnings:[],frameUID:'1'},{warnings:[],frameUID:'2'},true),[]);
  assert.deepEqual(formatWarningLines({warnings:[],frameUID:'1'},{warnings:[],frameUID:'1'}),[]);
});

test('app presents grouped warnings on separate lines',()=>{
  const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
  const css=readFileSync(new URL('../dist/viewer-layout.css',import.meta.url),'utf8');
  assert.match(app,/formatWarningLines\(state\.a,state\.b,state\.demo\)/);
  assert.match(app,/warnings\.join\('\\n'\)/);
  assert.match(css,/\.warning-notice\{white-space:pre-line\}/);
});

test('grouped warnings translate to English without mixed-language fragments',()=>{
  const lines=formatWarningLines({warnings:[sizeA,half],frameUID:'1'},{warnings:[sizeB,seam],frameUID:'2'});
  for(const line of lines){
    const english=localizeMessage(line,'en');
    assert.doesNotMatch(english,/[А-Яа-яЁё]/);
    assert.match(english,/A|B/);
  }
});
