import test from 'node:test';
import assert from 'node:assert/strict';
import {formatSeriesDate} from '../dist/series-date.mjs';

test('date labels distinguish the DICOM source and language',()=>{
  assert.equal(formatSeriesDate({date:'2024-03-05',dateSource:'series'},'ru'),'Серия: 05.03.2024');
  assert.equal(formatSeriesDate({date:'2024-03-05',dateSource:'series'},'en'),'Series: 2024-03-05');
  assert.equal(formatSeriesDate({date:'2024-03-05',dateSource:'study'},'ru'),'Исследование: 05.03.2024');
  assert.equal(formatSeriesDate({date:'2024-03-05',dateSource:'acquisition'},'en'),'Acquired: 2024-03-05');
});
test('unknown or conflicting DICOM dates are explicitly identified',()=>{
  assert.equal(formatSeriesDate({date:null,dateSource:null},'ru'),'Дата не указана');
  assert.equal(formatSeriesDate({date:null,dateSource:'mixed'},'en'),'Different dates');
});
