import assert from 'node:assert/strict';
import test from 'node:test';
import {renderSupportRideContext} from '../src/support-ride-context.js';
function surface(){
 const section={hidden:false};
 const container={children:[],replaceChildren(){this.children=[];},append(p){this.children.push(p);},ownerDocument:{createElement(){return {textContent:''};}}};
 return {section,container};
}
test('moderation renders frozen evidence as text and keeps unknown GPS accuracy explicit',()=>{
 const ui=surface();
 renderSupportRideContext({rideId:'ride-one',rideContext:{capturedAt:'2026-10-25T14:40:00Z',ride:{state:'DRIVER_ARRIVED',passengerId:'passenger'},driver:{name:'<img src=x onerror=alert(1)>'},payment:{method:'pix',status:'paid',amountCents:1250,id:'same-payment'},events:[{recordedAt:'2026-10-25T14:38:01Z',state:'DRIVER_ARRIVED',paymentStatus:'paid',driverLocation:{latitude:-2.8,longitude:-40.5,observedAt:'2026-10-25T14:38:00Z',accuracyMeters:null}}],evidenceNote:'GPS não comprova sozinho presença física.'}},ui);
 assert.equal(ui.section.hidden,false);
 const text=ui.container.children.map(p=>p.textContent).join('\n');
 assert.match(text,/<img src=x onerror=alert\(1\)>/);assert.match(text,/precisão não disponível/);assert.match(text,/same-payment/);assert.match(text,/GPS não comprova/);
 renderSupportRideContext({subject:'General support'},ui);assert.equal(ui.section.hidden,true);assert.equal(ui.container.children.length,0,'switching tickets cannot leave another ride\'s evidence visible');
});
