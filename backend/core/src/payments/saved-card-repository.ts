import type { Pool } from 'pg';
export interface SavedCard {
  id: string; lastFourDigits: string; paymentMethodId: string;
  paymentMethodType: 'credit_card' | 'debit_card';
}
export interface SavedCardRepository {
  customer(passengerId: string, scope: string): Promise<string | null>;
  bindCustomer(passengerId: string, scope: string, customerId: string): Promise<string>;
  list(passengerId: string, scope: string): Promise<SavedCard[]>;
  save(passengerId: string, scope: string, card: SavedCard): Promise<void>;
  remove(passengerId: string, scope: string, cardId: string): Promise<void>;
}
export class InMemorySavedCardRepository implements SavedCardRepository {
  private customers = new Map<string, string>();
  private cards = new Map<string, SavedCard[]>();
  async customer(p: string, s: string) { return this.customers.get(`${p}:${s}`) ?? null; }
  async bindCustomer(p: string, s: string, id: string) {
    if ([...this.customers.entries()].some(([key, value]) => key !== `${p}:${s}` && key.endsWith(`:${s}`) && value === id)) throw new Error('Customer already bound');
    const current = await this.customer(p, s); this.customers.set(`${p}:${s}`, current ?? id); return current ?? id;
  }
  async list(p: string, s: string) { return (this.cards.get(`${p}:${s}`) ?? []).map(x => ({...x})); }
  async save(p: string, s: string, card: SavedCard) {
    const cards = await this.list(p, s); this.cards.set(`${p}:${s}`, [...cards.filter(x => x.id !== card.id), card]);
  }
  async remove(p: string, s: string, id: string) { this.cards.set(`${p}:${s}`, (await this.list(p,s)).filter(x => x.id !== id)); }
}
export class PostgresSavedCardRepository implements SavedCardRepository {
  constructor(private readonly pool: Pool) {}
  async customer(p: string, s: string) {
    const r = await this.pool.query('SELECT customer_id FROM passenger_payment_customers WHERE passenger_id=$1 AND gateway_scope=$2', [p,s]);
    return r.rows[0]?.customer_id ?? null;
  }
  async bindCustomer(p: string, s: string, id: string) {
    const r = await this.pool.query(`INSERT INTO passenger_payment_customers VALUES ($1,$2,$3)
      ON CONFLICT (passenger_id,gateway_scope) DO UPDATE SET customer_id=passenger_payment_customers.customer_id RETURNING customer_id`, [p,s,id]);
    return r.rows[0].customer_id as string;
  }
  async list(p: string, s: string): Promise<SavedCard[]> {
    const r = await this.pool.query(`SELECT card_id AS id, last_four_digits AS "lastFourDigits", payment_method_id AS "paymentMethodId", payment_method_type AS "paymentMethodType"
      FROM passenger_saved_cards WHERE passenger_id=$1 AND gateway_scope=$2 ORDER BY created_at DESC`, [p,s]); return r.rows;
  }
  async save(p: string, s: string, c: SavedCard) {
    await this.pool.query(`INSERT INTO passenger_saved_cards (passenger_id,gateway_scope,card_id,last_four_digits,payment_method_id,payment_method_type)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (passenger_id,gateway_scope,card_id) DO NOTHING`, [p,s,c.id,c.lastFourDigits,c.paymentMethodId,c.paymentMethodType]);
  }
  async remove(p: string, s: string, id: string) { await this.pool.query('DELETE FROM passenger_saved_cards WHERE passenger_id=$1 AND gateway_scope=$2 AND card_id=$3',[p,s,id]); }
}
