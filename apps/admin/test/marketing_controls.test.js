import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const source = await readFile(new URL('../src/growth-admin.js', import.meta.url), 'utf8');
function triggerFields(trigger, repeated = false) {
  const fields = Object.fromEntries(['trigger','repeatAnnually','calendarDay','threshold','days','endsAt'].map(name => [name, {value: name === 'trigger' ? trigger : '10', checked: name === 'repeatAnnually' && repeated, label: {}, closest() {return this.label;}}]));
  const context = {el: () => ({elements: {namedItem: n => fields[n]}}), hasScope: () => true};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  function updateTriggerFields()'), source.indexOf('  function presetMessage(')) + '\nupdateTriggerFields();', context);
  return fields;
}
test('aniversário anual não é bloqueado por campos escondidos de outros objetivos', () => {
  const fields = triggerFields('birthday', true);
  for (const name of ['calendarDay','threshold','days','endsAt']) {
    assert.equal(fields[name].disabled, true);
    assert.equal(fields[name].required, false);
  }
});
test('data fixa e fidelidade só exigem seus respectivos campos', () => {
  const calendar = triggerFields('calendar');
  assert.equal(calendar.calendarDay.required, true);
  assert.equal(calendar.threshold.disabled, true);
  const loyalty = triggerFields('loyalty');
  assert.equal(loyalty.threshold.required, true);
  assert.equal(loyalty.calendarDay.disabled, true);
});
test('ativar campanha com controle geral pausado retoma o marketing', async () => {
  const calls = [];
  const context = {hasScope: () => true, getToken: () => 'session', data: {settings: {enabled:false, updatedAt:'old'}}, api: {saveMarketingCampaign: async (_, body) => calls.push(body), saveMarketingSettings: async (_, body) => calls.push(body)}, load: async () => {}, status: () => {}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  async function toggleCampaign('), source.indexOf('  function renderAutomations(')) + '\nresult = toggleCampaign({id:"campaign",enabled:true,automatic:true,updatedAt:"old"});', context);
  await context.result;
  assert.equal(calls[0].campaign.enabled, true);
  assert.equal(calls[1].settings.enabled, true);
});
