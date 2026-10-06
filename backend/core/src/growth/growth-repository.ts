import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { AdminActor, AdminRepository } from '../admin/admin-repository.js';
import { PostgresAdminRepository } from '../admin/repositories/postgres-admin-repository.js';
import {
  DEFAULT_SETTINGS,
  GrowthError,
  defaultPreference,
  type MarketingSettings,
  type MarketingPreference,
  type MarketingCampaign,
  type MarketingDelivery,
  type IssueReview,
  type Referral,
} from './growth-model.js';

export interface GrowthRepository {
  settings(): Promise<MarketingSettings>;
  saveSettings(
    s: MarketingSettings,
    expected: string,
    actor: AdminActor,
  ): Promise<void>;
  campaigns(): Promise<MarketingCampaign[]>;
  saveCampaign(
    c: MarketingCampaign,
    expected: string | null,
    actor: AdminActor,
  ): Promise<void>;
  preference(id: string): Promise<MarketingPreference>;
  savePreference(p: MarketingPreference): Promise<void>;
  deliveries(
    campaignId?: string,
    passengerId?: string,
  ): Promise<MarketingDelivery[]>;
  reserve(d: MarketingDelivery, expected: string): Promise<boolean>;
  claim(id: string): Promise<MarketingDelivery | null>;
  finish(d: MarketingDelivery): Promise<void>;
  markOpened(id: string, passengerId: string, now: string): Promise<void>;
  reviews(): Promise<IssueReview[]>;
  saveReview(r: IssueReview, actor: AdminActor): Promise<void>;
  referrals(): Promise<Referral[]>;
  saveReferral(r: Referral): Promise<void>;
  forget(passengerId: string): Promise<void>;
}
const audit = (
  actor: AdminActor,
  action: string,
  id: string,
  metadata: Record<string, unknown> = {},
) => ({
  id: randomUUID(),
  actor,
  action,
  targetType: 'growth',
  targetId: id,
  metadata,
  createdAt: new Date().toISOString(),
});
function assertCampaignLimits(c: MarketingCampaign, ds: MarketingDelivery[]) {
  const own = ds.filter((d) => d.campaignId === c.id);
  if (
    own.reduce((s, d) => s + d.heldCents, 0) > c.budgetCents ||
    own.length > c.maxRecipients
  )
    throw new GrowthError(
      409,
      'O orçamento e o limite de destinatários não podem ficar abaixo do que já foi reservado.',
    );
}
const conflict = () =>
  new GrowthError(409, 'Os dados foram alterados. Atualize antes de salvar.');
function mayReserve(
  settings: MarketingSettings,
  campaign: MarketingCampaign | undefined,
  deliveries: MarketingDelivery[],
  d: MarketingDelivery,
  version: string,
): boolean {
  if (
    !settings.enabled ||
    !campaign?.enabled ||
    campaign.updatedAt !== version ||
    campaign.startsAt > d.createdAt ||
    campaign.endsAt <= d.createdAt
  )
    return false;
  if (
    deliveries.some(
      (x) =>
        x.campaignId === d.campaignId &&
        x.passengerId === d.passengerId &&
        x.occurrence === d.occurrence,
    )
  )
    return false;
  const own = deliveries.filter((x) => x.campaignId === d.campaignId);
  if (
    own.length >= campaign.maxRecipients ||
    own.reduce((s, x) => s + x.heldCents, 0) + d.heldCents >
      campaign.budgetCents
  )
    return false;
  const week = Date.parse(d.createdAt) - 7 * 86400000;
  if (
    !d.control &&
    deliveries
      .filter(
        (x) =>
          !x.control &&
          x.passengerId === d.passengerId &&
          Date.parse(x.createdAt) > week,
      )
      .reduce((sum, x) => sum + x.channels.length, 0) +
      d.channels.length >
      settings.maxContactsPerWeek
  )
    return false;
  return true;
}
export class InMemoryGrowthRepository implements GrowthRepository {
  private config = structuredClone(DEFAULT_SETTINGS);
  private cs: MarketingCampaign[] = [];
  private ps = new Map<string, MarketingPreference>();
  private ds: MarketingDelivery[] = [];
  private rs: IssueReview[] = [];
  private refs: Referral[] = [];
  constructor(private readonly admin: AdminRepository) {}
  async settings() {
    return structuredClone(this.config);
  }
  async saveSettings(
    s: MarketingSettings,
    expected: string,
    actor: AdminActor,
  ) {
    if (this.config.updatedAt !== expected) throw conflict();
    await this.admin.appendAudit(
      audit(actor, 'marketing.settings.updated', 'settings', {
        enabled: s.enabled,
      }),
    );
    this.config = structuredClone(s);
  }
  async campaigns() {
    return structuredClone(this.cs);
  }
  async saveCampaign(
    c: MarketingCampaign,
    expected: string | null,
    actor: AdminActor,
  ) {
    const old = this.cs.find((x) => x.id === c.id);
    if (expected === null ? !!old : old?.updatedAt !== expected)
      throw conflict();
    assertCampaignLimits(c, this.ds);
    await this.admin.appendAudit(
      audit(actor, 'marketing.campaign.saved', c.id, {
        enabled: c.enabled,
        budgetCents: c.budgetCents,
      }),
    );
    this.cs = this.cs.filter((x) => x.id !== c.id);
    this.cs.push(structuredClone(c));
  }
  async preference(id: string) {
    return structuredClone(this.ps.get(id) ?? defaultPreference(id));
  }
  async savePreference(p: MarketingPreference) {
    this.ps.set(p.passengerId, structuredClone(p));
  }
  async deliveries(cid?: string, pid?: string) {
    return structuredClone(
      this.ds.filter(
        (d) =>
          (!cid || d.campaignId === cid) && (!pid || d.passengerId === pid),
      ),
    );
  }
  async reserve(d: MarketingDelivery, v: string) {
    if (
      !mayReserve(
        this.config,
        this.cs.find((c) => c.id === d.campaignId),
        this.ds,
        d,
        v,
      )
    )
      return false;
    const p = this.ps.get(d.passengerId);
    if (!p || d.channels.some((c) => !p.channels[c])) return false;
    this.ds.push(structuredClone(d));
    return true;
  }
  async claim(id: string) {
    const d = this.ds.find((d) => d.id === id);
    if (!d || d.state !== 'pending') return null;
    d.state = 'processing';
    return structuredClone(d);
  }
  async finish(d: MarketingDelivery) {
    const index = this.ds.findIndex((x) => x.id === d.id);
    if (index < 0) throw new GrowthError(404, 'Entrega não encontrada.');
    if (this.ds[index]!.passengerId !== d.passengerId) return; // Do not restore erased data from an in-flight sender.
    this.ds[index] = structuredClone(d);
  }
  async markOpened(id: string, pid: string, now: string) {
    const d = this.ds.find((x) => x.id === id && x.passengerId === pid);
    if (!d) throw new GrowthError(404, 'Mensagem não encontrada.');
    d.openedAt ??= now;
  }
  async reviews() {
    return structuredClone(this.rs);
  }
  async saveReview(r: IssueReview, actor: AdminActor) {
    await this.admin.appendAudit(
      audit(actor, 'issues.review.updated', r.key, {
        status: r.status,
        owner: r.owner,
      }),
    );
    this.rs = this.rs.filter((x) => x.key !== r.key);
    this.rs.push(structuredClone(r));
  }
  async referrals() {
    return structuredClone(this.refs);
  }
  async saveReferral(r: Referral) {
    if (
      r.passengerId === r.referrerId ||
      this.refs.some((x) => x.passengerId === r.passengerId)
    )
      throw new GrowthError(409, 'Indicação já registrada ou inválida.');
    this.refs.push(structuredClone(r));
  }
  async forget(id: string) {
    this.ps.delete(id);
    this.ds = this.ds.map((d) =>
      d.passengerId === id
        ? {
            ...d,
            passengerId: `erased:${randomUUID()}`,
            occurrence: randomUUID(),
            couponId: null,
            title: 'Removido',
            message: 'Removido',
            channels: [],
            results: {},
            openedAt: null,
          }
        : d,
    );
    this.refs = this.refs.filter(
      (r) => r.passengerId !== id && r.referrerId !== id,
    );
  }
}
export class PostgresGrowthRepository implements GrowthRepository {
  constructor(private readonly pool: Pool) {}
  async settings() {
    return (
      await this.pool.query('SELECT data FROM marketing_settings WHERE id=true')
    ).rows[0].data as MarketingSettings;
  }
  async campaigns() {
    return (
      await this.pool.query(
        'SELECT data FROM marketing_campaigns ORDER BY updated_at DESC',
      )
    ).rows.map((r) => r.data as MarketingCampaign);
  }
  async preference(id: string) {
    return (
      (
        await this.pool.query(
          'SELECT data FROM marketing_preferences WHERE passenger_id=$1',
          [id],
        )
      ).rows[0]?.data ?? defaultPreference(id)
    );
  }
  private async write(action: (c: Pool) => Promise<void>) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await action(c as unknown as Pool);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async saveSettings(
    s: MarketingSettings,
    expected: string,
    actor: AdminActor,
  ) {
    await this.write(async (c) => {
      const r = await c.query(
        "UPDATE marketing_settings SET data=$1::jsonb WHERE id=true AND data->>'updatedAt'=$2",
        [JSON.stringify(s), expected],
      );
      if (!r.rowCount) throw conflict();
      await new PostgresAdminRepository(c).appendAudit(
        audit(actor, 'marketing.settings.updated', 'settings', {
          enabled: s.enabled,
        }),
      );
    });
  }
  async saveCampaign(
    campaign: MarketingCampaign,
    expected: string | null,
    actor: AdminActor,
  ) {
    await this.write(async (c) => {
      if (expected === null) {
        const r = await c.query(
          'INSERT INTO marketing_campaigns(id,data,updated_at) VALUES($1,$2::jsonb,$3) ON CONFLICT DO NOTHING',
          [campaign.id, JSON.stringify(campaign), campaign.updatedAt],
        );
        if (!r.rowCount) throw conflict();
      } else {
        await c.query(
          'SELECT id FROM marketing_campaigns WHERE id=$1 FOR UPDATE',
          [campaign.id],
        );
        const ds = (
          await c.query(
            'SELECT data FROM marketing_deliveries WHERE campaign_id=$1',
            [campaign.id],
          )
        ).rows.map((r) => r.data as MarketingDelivery);
        assertCampaignLimits(campaign, ds);
        const r = await c.query(
          "UPDATE marketing_campaigns SET data=$2::jsonb,updated_at=$3 WHERE id=$1 AND data->>'updatedAt'=$4",
          [campaign.id, JSON.stringify(campaign), campaign.updatedAt, expected],
        );
        if (!r.rowCount) throw conflict();
      }
      await new PostgresAdminRepository(c).appendAudit(
        audit(actor, 'marketing.campaign.saved', campaign.id, {
          enabled: campaign.enabled,
          budgetCents: campaign.budgetCents,
        }),
      );
    });
  }
  async savePreference(p: MarketingPreference) {
    await this.pool.query(
      'INSERT INTO marketing_preferences(passenger_id,data,updated_at) VALUES($1,$2::jsonb,$3) ON CONFLICT(passenger_id) DO UPDATE SET data=EXCLUDED.data,updated_at=EXCLUDED.updated_at',
      [p.passengerId, JSON.stringify(p), p.updatedAt],
    );
  }
  async deliveries(cid?: string, pid?: string) {
    const r = await this.pool.query(
      'SELECT data FROM marketing_deliveries WHERE ($1::uuid IS NULL OR campaign_id=$1) AND ($2::text IS NULL OR passenger_id=$2) ORDER BY created_at DESC LIMIT 10001',
      [cid ?? null, pid ?? null],
    );
    if (r.rows.length > 10000)
      throw new GrowthError(
        422,
        'Mais de 10.000 entregas. Reduza o escopo da consulta antes de executar novas campanhas.',
      );
    return r.rows.map((r) => r.data as MarketingDelivery);
  }
  async reserve(d: MarketingDelivery, version: string) {
    let accepted = false;
    await this.write(async (c) => {
      // Serialize only the short reservation transaction across instances; external
      // providers are called after commit. Lock order is always settings -> campaign.
      const settings = (
        await c.query(
          'SELECT data FROM marketing_settings WHERE id=true FOR UPDATE',
        )
      ).rows[0].data as MarketingSettings;
      const campaign = (
        await c.query(
          'SELECT data FROM marketing_campaigns WHERE id=$1 FOR UPDATE',
          [d.campaignId],
        )
      ).rows[0]?.data as MarketingCampaign | undefined;
      const preference = (
        await c.query(
          'SELECT data FROM marketing_preferences WHERE passenger_id=$1 FOR UPDATE',
          [d.passengerId],
        )
      ).rows[0]?.data as MarketingPreference | undefined;
      if (!preference || d.channels.some((ch) => !preference.channels[ch]))
        return;
      const history = (
        await c.query(
          'SELECT data FROM marketing_deliveries WHERE campaign_id=$1 OR (passenger_id=$2 AND created_at>$3)',
          [
            d.campaignId,
            d.passengerId,
            new Date(Date.parse(d.createdAt) - 7 * 86400000).toISOString(),
          ],
        )
      ).rows.map((r) => r.data as MarketingDelivery);
      if (!mayReserve(settings, campaign, history, d, version)) return;
      const r = await c.query(
        'INSERT INTO marketing_deliveries(id,campaign_id,passenger_id,occurrence,created_at,state,held_cents,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT DO NOTHING',
        [
          d.id,
          d.campaignId,
          d.passengerId,
          d.occurrence,
          d.createdAt,
          d.state,
          d.heldCents,
          JSON.stringify(d),
        ],
      );
      accepted = !!r.rowCount;
    });
    return accepted;
  }
  async claim(id: string) {
    const r = await this.pool.query(
      "UPDATE marketing_deliveries SET state='processing',data=jsonb_set(data,'{state}','\"processing\"') WHERE id=$1 AND state='pending' RETURNING data",
      [id],
    );
    return r.rows[0]?.data ?? null;
  }
  async finish(d: MarketingDelivery) {
    await this.pool.query(
      'UPDATE marketing_deliveries SET state=$2,data=$3::jsonb WHERE id=$1 AND passenger_id=$4',
      [d.id, d.state, JSON.stringify(d), d.passengerId],
    );
  }
  async markOpened(id: string, pid: string, now: string) {
    const r = await this.pool.query(
      "UPDATE marketing_deliveries SET data=jsonb_set(data,'{openedAt}',COALESCE(NULLIF(data->'openedAt','null'::jsonb),to_jsonb($3::text))) WHERE id=$1 AND passenger_id=$2 RETURNING id",
      [id, pid, now],
    );
    if (!r.rowCount) throw new GrowthError(404, 'Mensagem não encontrada.');
  }
  async reviews() {
    return (
      await this.pool.query('SELECT data FROM operational_issue_reviews')
    ).rows.map((r) => r.data as IssueReview);
  }
  async saveReview(r: IssueReview, actor: AdminActor) {
    await this.write(async (c) => {
      await c.query(
        'INSERT INTO operational_issue_reviews(key,data) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data',
        [r.key, JSON.stringify(r)],
      );
      await new PostgresAdminRepository(c).appendAudit(
        audit(actor, 'issues.review.updated', r.key, {
          status: r.status,
          owner: r.owner,
        }),
      );
    });
  }
  async referrals() {
    return (
      await this.pool.query('SELECT * FROM marketing_referrals')
    ).rows.map((r) => ({
      code: r.code,
      referrerId: r.referrer_id,
      passengerId: r.passenger_id,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }
  async saveReferral(r: Referral) {
    const result = await this.pool.query(
      'INSERT INTO marketing_referrals(passenger_id,referrer_id,code,created_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [r.passengerId, r.referrerId, r.code, r.createdAt],
    );
    if (!result.rowCount)
      throw new GrowthError(409, 'Indicação já registrada.');
  }
  async forget(id: string) {
    await this.write(async (c) => {
      await c.query('DELETE FROM marketing_preferences WHERE passenger_id=$1', [
        id,
      ]);
      await c.query(
        "UPDATE promotion_campaigns SET enabled=false,target_passenger_id='erased:' || id::text WHERE target_passenger_id=$1",
        [id],
      );
      await c.query(
        "UPDATE marketing_deliveries SET passenger_id='erased:' || id::text,occurrence=id::text,data=data || jsonb_build_object('passengerId','erased:' || id::text,'occurrence',id::text,'couponId',NULL,'title','Removido','message','Removido','channels','[]'::jsonb,'results','{}'::jsonb,'openedAt',NULL) WHERE passenger_id=$1",
        [id],
      );
      await c.query(
        'DELETE FROM marketing_referrals WHERE passenger_id=$1 OR referrer_id=$1',
        [id],
      );
    });
  }
}
