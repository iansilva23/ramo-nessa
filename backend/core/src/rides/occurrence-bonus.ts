import type {RideRecord} from './ride.js';
export interface OccurrenceBonus{penaltyId:string;amountCents:number;injuredDriverId:string}
export function bonusForMethod(bonus:OccurrenceBonus|undefined,method:string|undefined,currentDriverId:string){
 if(!bonus)return {amountCents:0,driverId:currentDriverId};
 if(!Number.isSafeInteger(bonus.amountCents)||bonus.amountCents<=0||!bonus.injuredDriverId)throw Error('Bônus de ocorrência inválido.');
 if(method!=='pix'&&method!=='cash')throw Error('O adicional de ocorrência exige Pix ou dinheiro.');
 return {amountCents:bonus.amountCents,driverId:method==='pix'?bonus.injuredDriverId:currentDriverId};
}
export function occurrenceBonusCents(ride:Pick<RideRecord,'occurrenceBonus'>){return ride.occurrenceBonus?.amountCents??0;}
