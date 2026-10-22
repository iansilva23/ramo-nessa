// Synthetic fixtures only, for disposable CI databases.
import {randomUUID} from 'node:crypto';
export async function seedConfirmedTests(client){
  const rideIds=[];
  for(const [i,state]of ['AWAITING_PAYMENT','AWAITING_PAYMENT','AWAITING_PAYMENT','AWAITING_PAYMENT','REFUNDED','REFUNDED','REFUNDED','PAYMENT_FAILED','COMPLETED'].entries()){
    const id=randomUUID();rideIds.push(id);const total=i===8?700:1000;
    await client.query(`INSERT INTO rides (id,passenger_id,state,payment_status,origin_zone_id,destination_zone_id,category,price_period,passengers,pricing_rule_id,base_amount_cents,pickup_compensation_cents,total_amount_cents,platform_commission_cents,driver_net_cents)
      VALUES ($1,'fixture-passenger',$2,$3,'fixture-origin','fixture-destination','mototaxi','day',1,'fixture-rule',$4,0,$4,$5,$6)`,[id,state,state==='COMPLETED'?'paid':state==='REFUNDED'?'refunded':'pending',total,total/10,total-total/10]);
  }
  for(const [i,status,amount]of [[0,'created',737],[7,'failed',737],[8,'paid',700],[4,'refunded',1000],[5,'refunded',1000],[6,'refunded',1097]])await client.query('INSERT INTO payments (id,ride_id,method,processor,status,amount_cents,idempotency_key) VALUES ($1,$2,\'pix\',\'mercado-pago-orders\',$3,$4,$5)',[randomUUID(),rideIds[i],status,amount,randomUUID()]);
  for(let i=0;i<11;i++)await client.query("INSERT INTO wallet_topups (id,passenger_id,method,processor,status,amount_cents,idempotency_key) VALUES ($1,'fixture-passenger','pix','mercado-pago-orders',$2,$3,$4)",[randomUUID(),i<8?'paid':i===8?'cancelled':'refunded',i<7?2000:i===7?2400:100,randomUUID()]);
  await client.query("INSERT INTO driver_payouts (id,driver_id,amount_cents,requested_amount_cents,status,idempotency_key) VALUES ($1,'fixture-driver',630,630,'paid',$2)",[randomUUID(),randomUUID()]);
  const id=randomUUID();await client.query("INSERT INTO ledger_transactions (id,kind,reference_key) VALUES ($1,'FIXTURE_HISTORY',$2)",[id,randomUUID()]);
  for(const [key,direction,amount]of [['processor:fixture-topup:clearing','debit',16400],['processor:fixture-payout:clearing','credit',630],['passenger:fixture-passenger:wallet','credit',15700],['platform:revenue','credit',70]])await client.query('INSERT INTO ledger_entries (id,transaction_id,account_key,direction,amount_cents) VALUES ($1,$2,$3,$4,$5)',[randomUUID(),id,key,direction,amount]);
  return {rideIds};
}
