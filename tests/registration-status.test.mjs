import test from 'node:test';
import assert from 'node:assert/strict';
import {nextRegistrationState,registrationStatusText} from '../dist/registration-status.mjs';
import {translate} from '../dist/localization.mjs';
import {readFileSync} from 'node:fs';

test('initial or replaced series have not been registered',()=>{
  assert.equal(registrationStatusText(nextRegistrationState('complete','volume')),'Корегистрация пока не выполнялась');
  assert.equal(nextRegistrationState('not-run','metric'),'not-run');
});
test('successful registration stays complete until its parameters change',()=>{
  assert.equal(registrationStatusText(nextRegistrationState('not-run','success')),'Корегистрация завершена');
  assert.equal(registrationStatusText(nextRegistrationState('complete','metric')),'Корегистрация с текущими параметрами не выполнялась. Нажми «Корегистрировать»');
  assert.equal(nextRegistrationState('stale','success'),'complete');
});
test('manual translation and rotation are identified independently',()=>{
  assert.equal(registrationStatusText(nextRegistrationState('complete','manual')),'Серия B смещена вручную');
  assert.equal(nextRegistrationState('manual','metric',false),'manual');
  assert.equal(nextRegistrationState('manual','metric',true),'stale');
  assert.equal(nextRegistrationState('manual','success'),'complete');
});
test('resetting a previously registered transform requires rerun; stopping preserves prior state',()=>{
  assert.equal(nextRegistrationState('complete','reset'),'stale');
  assert.equal(nextRegistrationState('not-run','reset'),'not-run');
  assert.equal(nextRegistrationState('manual','reset',false),'not-run');
  assert.equal(nextRegistrationState('manual','reset',true),'stale');
  assert.equal(nextRegistrationState('manual','stop'),'manual');
});
test('all four stable states have English translations and the 3D tag is absent',()=>{
  for(const state of ['not-run','complete','stale','manual'])assert.notEqual(translate(registrationStatusText(state),'en'),registrationStatusText(state));
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/class="small-tag">3D<\/span>/);
});
test('UI routes metric changes, manual adjustment, completed runs and series replacement through the status state',()=>{
  const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
  assert.match(app,/\$\('metric'\)\.addEventListener\('change',[\s\S]*?setRegistrationStage\('metric'\)/);
  assert.match(app,/function invalidateRegistration\(\)[\s\S]*?setRegistrationStage\('manual'\)/);
  assert.match(app,/data\.type==='done'[\s\S]*?setRegistrationStage\('success'/);
  assert.match(app,/resetRegistration\('volume'\)/);
});