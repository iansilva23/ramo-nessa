import assert from 'node:assert/strict';
import {resolve} from 'node:path';

export async function testCoordinateEntry(page, wizard, out, engine) {
  const lat=wizard.getByLabel('Latitude',{exact:true}),lon=wizard.getByLabel('Longitude',{exact:true});
  const apply=wizard.getByRole('button',{name:'Posicionar no mapa',exact:true});
  const summary=wizard.locator('.rp-hint').filter({hasText:'Ponto selecionado:'});
  assert.equal(await lat.inputValue(),'');assert.equal(await lon.inputValue(),'');
  await wizard.getByLabel('Raio de cobertura (km)',{exact:true}).fill('0.8');
  await lat.fill(' -2,820170123456 ');await lon.fill('-40,414670987654');
  await apply.click();
  assert.equal(await lat.inputValue(),'-2.820170123456');
  assert.equal(await lon.inputValue(),'-40.414670987654');
  const before=await summary.textContent();
  for(const [a,b]of [['','-40'],['NaN','-40'],['86','-40'],['-2','181'],['1e2','-40'],['-2°49\'','-40']]){
    await lat.fill(a);await lon.fill(b);await apply.click();
    assert.equal(await summary.textContent(),before,'Invalid coordinates must not move the map');
    assert.equal(await lat.inputValue(),a);assert.equal(await lon.inputValue(),b);
  }
  await wizard.getByRole('button',{name:'Continuar',exact:true}).click();
  assert.match(await wizard.locator('[aria-current="step"]').textContent(),/Localização/);
  assert.match(await wizard.locator('.rp-dialog-message').textContent(),/latitude/i);
  await lat.fill('0');await lon.fill('0');await lon.press('Enter');
  assert.equal(await lat.inputValue(),'0');assert.equal(await lon.inputValue(),'0');
  assert.match(await summary.textContent(),/0\.00000, 0\.00000/);
  assert.match(await wizard.locator('[aria-current="step"]').textContent(),/Localização/);
  // A coordinate application must not silently fix an invalid coverage radius.
  await wizard.getByLabel('Raio de cobertura (km)',{exact:true}).fill('101');
  await lat.fill('-2,820000123456');await lon.fill('-40,400000987654');
  await apply.click();
  assert.equal(await wizard.getByLabel('Raio de cobertura (km)',{exact:true}).inputValue(),'101');
  await wizard.getByRole('button',{name:'Continuar',exact:true}).click();
  assert.match(await wizard.locator('[aria-current="step"]').textContent(),/Localização/);
  await lat.fill('-2,820000123456');await lon.fill('-40,400000987654');
  await wizard.getByLabel('Raio de cobertura (km)',{exact:true}).fill('0.8');
  assert.equal(await lat.inputValue(),'-2,820000123456','Radius input must preserve unfinished coordinate text');
  assert.equal(await lon.inputValue(),'-40,400000987654');
  await apply.click();
  assert.equal(await wizard.getByLabel('Raio de cobertura (km)',{exact:true}).inputValue(),'0.8');
  assert.equal(await lat.inputValue(),'-2.820000123456');
  assert.equal(await lon.inputValue(),'-40.400000987654');
  for(const width of [1440,860,390]){
    await page.setViewportSize({width,height:width===390?844:1000});
    await wizard.evaluate(n=>{n.scrollTop=0;});
    const order=await wizard.evaluate(n=>{
      const input=name=>[...n.querySelectorAll('input')].find(i=>n.querySelector('label[for="'+i.id+'"]')?.textContent===name);
      return input('Pesquisar no mapa').getBoundingClientRect().bottom<input('Latitude').getBoundingClientRect().top;
    });
    assert.equal(order,true,'Coordinates must be below search');
    assert.equal(await wizard.evaluate(n=>n.scrollWidth>n.clientWidth+1),false);
    await page.screenshot({path:resolve(out,engine+'-coordinates-'+width+'.png')});
    if(engine==='chromium')console.log('RP_COORD_PREVIEW_'+width+':'+(await page.screenshot({type:'jpeg',quality:45})).toString('base64'));
  }
  await page.setViewportSize({width:1440,height:1000});
}
