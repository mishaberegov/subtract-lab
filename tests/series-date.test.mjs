import test from 'node:test';
import assert from 'node:assert/strict';
import {formatSeriesDate,seriesDateSource} from '../dist/series-date.mjs';

test('date labels show only the date in each language',()=>{
  assert.equal(formatSeriesDate({date:'2024-03-05',dateSource:'series'},'ru'),'05-03-2024');
  assert.equal(formatSeriesDate({date:'2024-03-05',dateSource:'series'},'en'),'05-03-2024');
  assert.equal(formatSeriesDate({date:'2024-03-05',dateSource:'study'},'ru'),'05-03-2024');
  assert.equal(formatSeriesDate({date:'2024-03-05',dateSource:'acquisition'},'en'),'05-03-2024');
});
test('source is available as a tooltip, not as a date prefix',()=>{
  assert.equal(seriesDateSource({date:'2024-03-05',dateSource:'series'},'ru'),'Дата серии');
  assert.equal(seriesDateSource({date:'2024-03-05',dateSource:'acquisition'},'en'),'Acquisition date');
  assert.equal(seriesDateSource({date:'2024-03-05',dateSource:'study'},'ru'),'Дата исследования');
  assert.equal(seriesDateSource({date:null,dateSource:null},'ru'),'');
});
test('unknown or conflicting DICOM dates are explicitly identified',()=>{
  assert.equal(formatSeriesDate({date:null,dateSource:null},'ru'),'Дата не указана');
  assert.equal(formatSeriesDate({date:null,dateSource:'mixed'},'en'),'Different dates');
});
