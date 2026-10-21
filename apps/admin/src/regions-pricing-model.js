export const icons = {
  moto:'M8 17a4 4 0 1 1-4-4m0 0h7l3-6h4m-5 3 3 7h4m-2 0a4 4 0 1 1 0 .01M10 7H6',
  delivery:'M3 8h18v13H3zM3 8l4-5h10l4 5M9 12h6',
  car:'M3 17v-6l3-7h12l3 7v6M3 11h18M6 17v3m12-3v3M6 14h2m8 0h2',
  buggy:'M3 17v-6h18v6M7 11V5h10l3 6M6 17v3m12-3v3M10 5v6',
  comfort_black:'M3 17v-7l3-6h12l3 6v7M3 10h18M6 17v3m12-3v3M6 14h2m8 0h2M9 2h6',
};
export function moneyInputCents(raw, {optional=false}={}) {
  const text=String(raw??'').trim().replace(',','.');
  if(!text&&optional)return null;
  if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(text))throw new Error('Informe um valor com até duas casas decimais.');
  const [whole,fraction='']=text.split('.');
  const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(cents<0||cents>100_000_000)throw new Error('Valor fora do limite permitido.');
  return cents;
}
export const formatMoney=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export const inputMoney=cents=>cents==null?'':(cents/100).toFixed(2);
export function distanceKm(a,b){
  const rad=x=>x*Math.PI/180;
  const h=Math.sin(rad(b.latitude-a.latitude)/2)**2+
    Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}
export function overlappingRegions(region,regions){
  return regions.filter(r=>r.id!==region.id&&r.enabled&&!r.archived&&distanceKm(region,r)<region.radiusKm+r.radiusKm);
}
export function formatRate(rate,period){
  const value=rate[period];
  if(!value)return 'Indisponível';
  const amount=formatMoney(value.amountCents)+(rate.kind==='distance'?' / km':'');
  return amount+(rate.kind==='distance'&&value.minimumCents>0?' · mínimo '+formatMoney(value.minimumCents):'');
}
export function nextTabIndex(index,key,total){
  if(key==='Home')return 0;if(key==='End')return total-1;
  return (index+(key==='ArrowLeft'?-1:1)+total)%total;
}
