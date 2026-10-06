import { createHash, randomUUID } from 'node:crypto';
import type {
  AuthOtpRepository,
  AuthIdentityRecord,
} from '../auth/auth-otp-repository.js';
import type { RideRepository } from '../rides/ride-repository.js';
import type { RideRecord } from '../rides/ride.js';
import type {
  DriverSupportRepository,
  DriverSupportTicketRecord,
} from '../drivers/driver-support-repository.js';
import type { RideMatchingRepository } from '../matching/ride-matching-repository.js';
import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import type { PricingCatalogSnapshot } from '../pricing/catalog-snapshot.js';
import { classifyCoordinateByCatalog } from '../places/coordinate-place-policy.js';
import { createPromotionCampaignRecord } from '../promotions/promotion-service.js';
import type { PromotionRepository } from '../promotions/promotion-repository.js';
import type { AdminActor, AdminRepository } from '../admin/admin-repository.js';
import type { PrivacyRepository } from '../privacy/privacy-repository.js';
import type { GrowthRepository } from './growth-repository.js';
import {
  CAMPAIGN_TEMPLATES,
  GrowthError,
  isQuiet,
  localClock,
  type MarketingCampaign,
  type MarketingPreference,
  type MarketingDelivery,
  type Channel,
  type Issue,
} from './growth-model.js';

export interface Customer {
  identity: AuthIdentityRecord;
  preference: MarketingPreference;
  rides: RideRecord[];
  completed: number;
  active: number;
  tickets: DriverSupportTicketRecord[];
}
export interface GrowthDependencies {
  store: GrowthRepository;
  privacy: PrivacyRepository;
  identities: AuthOtpRepository;
  rides: RideRepository;
  support: DriverSupportRepository;
  matching: RideMatchingRepository;
  drivers: DriverSupplyRepository;
  promotions: PromotionRepository;
  admin: AdminRepository;
  catalog(): Promise<PricingCatalogSnapshot>;
  canWork(id: string): Promise<boolean>;
  send(
    channel: Channel,
    customer: Customer,
    delivery: MarketingDelivery,
    coupon: string | null,
  ): Promise<'published' | 'accepted' | 'failed'>;
  readiness(): Record<Channel, boolean>;
}
const daysSince = (now: Date, at: string) =>
  Math.max(0, (now.getTime() - Date.parse(at)) / 86400000);
const latestComplete = (c: Customer) =>
  c.rides
    .filter((r) => r.state === 'COMPLETED')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
function completeBirthday(md: string | null, now: Date): boolean {
  const clock = localClock(now),
    y = Number(clock.day.slice(0, 4));
  return (
    md === clock.monthDay ||
    (md === '02-29' &&
      clock.monthDay === '02-28' &&
      new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 2)
  );
}
export function campaignOccurrence(
  c: MarketingCampaign,
  u: Customer,
  now: Date,
): string | null {
  const clock = localClock(now),
    last = latestComplete(u),
    latest = u.rides[0];
  switch (c.trigger) {
    case 'birthday':
      return completeBirthday(u.preference.birthdayMonthDay, now)
        ? clock.day.slice(0, 4)
        : null;
    case 'calendar':
      return c.calendarDay === clock.monthDay ? clock.day.slice(0, 4) : null;
    case 'never_used':
      return u.completed === 0 && daysSince(now, u.identity.createdAt) >= c.days
        ? u.identity.createdAt
        : null;
    case 'inactive':
      return last && daysSince(now, last.updatedAt) >= c.days ? last.id : null;
    case 'first_ride':
      return u.completed === 1 &&
        last &&
        daysSince(now, last.updatedAt) <= c.days
        ? last.id
        : null;
    case 'loyalty':
      return u.completed >= c.threshold
        ? String(Math.floor(u.completed / c.threshold))
        : null;
    case 'no_driver':
      return latest?.state === 'NO_DRIVER_FOUND' &&
        daysSince(now, latest.updatedAt) <= c.days
        ? latest.id
        : null;
    case 'abandoned':
      return latest?.state === 'AWAITING_PAYMENT' &&
        daysSince(now, latest.createdAt) >= c.days
        ? latest.id
        : null;
    case 'support_resolved': {
      const t = u.tickets.find(
        (t) => t.status === 'resolved' && daysSince(now, t.updatedAt) <= c.days,
      );
      return t?.id ?? null;
    }
    case 'referral':
    case 'coupon_expiring':
      return null; // Evaluated against server-side records below.
  }
}
export function baseEligibility(
  c: MarketingCampaign,
  u: Customer,
  now: Date,
): string | null {
  if (
    !c.enabled ||
    now.toISOString() < c.startsAt ||
    now.toISOString() >= c.endsAt
  )
    return 'Campanha desativada ou fora da vigência';
  if (u.identity.status !== 'active') return 'Conta indisponível';
  if (u.active > 0) return 'Corrida em andamento';
  if (u.tickets.some((t) => t.status === 'open' || t.status === 'in_progress'))
    return 'Chamado de suporte pendente';
  if (c.audience !== 'all' && u.preference.audience !== c.audience)
    return 'Outro público';
  const zone = u.preference.zone ?? u.rides[0]?.origin.zoneId;
  if (c.zones.length && (!zone || !c.zones.includes(zone)))
    return 'Região não identificada ou fora da campanha';
  if (
    c.categories.length &&
    u.rides.length &&
    !u.rides.some((r) => c.categories.includes(r.category))
  )
    return 'Outra categoria';
  return null;
}
export function detectRideIssues(
  rides: RideRecord[],
  tickets: DriverSupportTicketRecord[],
  now: Date,
): Issue[] {
  const items: Issue[] = [];
  for (const r of rides) {
    const age = (now.getTime() - Date.parse(r.updatedAt)) / 60000;
    const issue = (
      key: string,
      severity: Issue['severity'],
      title: string,
      causes: string[],
      actions: string[],
    ) =>
      items.push({
        key: `${key}:${r.id}`,
        severity,
        title,
        evidence: `Corrida ${r.id} · estado ${r.state} · pagamento ${r.paymentStatus} · ${Math.max(0, Math.floor(age))} min desde a atualização`,
        causes,
        actions,
        source: 'ride',
        sourceId: r.id,
        zone: r.origin.zoneId,
        category: r.category,
        at: r.updatedAt,
      });
    if (r.state === 'REFUND_PENDING' && age >= 10)
      issue(
        'refund',
        'critical',
        'Reembolso pendente há mais de 10 minutos',
        ['Provedor indisponível', 'Falha de processamento ou conciliação'],
        [
          'Conferir pagamento e histórico do reembolso no financeiro',
          'Verificar o provedor antes de repetir qualquer operação',
        ],
      );
    if (r.state === 'NO_DRIVER_FOUND')
      issue(
        'no-driver',
        'warning',
        'Pedido sem motorista',
        [
          'Pouca oferta disponível',
          'Distância até o passageiro',
          'Valor pouco atrativo',
        ],
        [
          'Conferir frota disponível nessa região e categoria',
          'Investigar recusas e valor líquido',
          'Ajustar divulgação no período até melhorar o atendimento',
        ],
      );
    if (r.state === 'PAYMENT_FAILED')
      issue(
        'payment',
        'warning',
        'Pagamento não concluído',
        ['Recusa do provedor', 'Dados inválidos ou falha na conexão'],
        [
          'Conferir o motivo no provedor e o pagamento no financeiro',
          'Oferecer orientação pelo suporte sem repetir a cobrança',
        ],
      );
    if (
      [
        'SEARCHING_DRIVER',
        'DRIVER_ASSIGNED',
        'DRIVER_ARRIVING',
        'DRIVER_ARRIVED',
      ].includes(r.state) &&
      age >= 30
    )
      issue(
        'stalled',
        'warning',
        'Possível corrida sem evolução',
        [
          'Motorista ou passageiro sem conexão',
          'Etapa não confirmada',
          'Falha no fluxo',
        ],
        [
          'Consultar as partes e o histórico da corrida',
          'Encaminhar ao suporte antes de cancelar',
        ],
      );
    if (r.state === 'IN_PROGRESS' && age >= 120)
      issue(
        'long-ride',
        'warning',
        'Corrida em andamento há mais de duas horas',
        ['Viagem longa', 'Conclusão não confirmada', 'Problema operacional'],
        [
          'Conferir o trajeto e falar com as partes',
          'Não encerrar automaticamente uma corrida em andamento',
        ],
      );
  }
  for (const t of tickets.filter(
    (t) => t.status === 'open' || t.status === 'in_progress',
  ))
    items.push({
      key: `support:${t.id}`,
      severity: t.category === 'payment' ? 'warning' : 'info',
      title: 'Chamado aguardando atendimento',
      evidence: `${t.requesterType === 'driver' ? 'Motorista' : 'Passageiro'} · ${t.category} · ${t.subject}`,
      causes: ['Relato do usuário; a causa ainda precisa ser investigada'],
      actions: [
        'Abrir o chamado na área de suporte',
        'Responder, registrar a solução e acompanhar o retorno',
      ],
      source: 'support',
      sourceId: t.id,
      zone: null,
      category: null,
      at: t.updatedAt,
    });
  return items;
}
export class GrowthService {
  private running = false;
  constructor(readonly deps: GrowthDependencies) {}
  async customer(id: string): Promise<Customer | null> {
    const identity = await this.deps.identities.findIdentityBySubject(
      'passenger',
      id,
    );
    if (!identity) return null;
    const [preference, rides, summary, tickets, privacy] = await Promise.all([
      this.deps.store.preference(id),
      this.deps.rides.listAdminRecentByPassengerId(id, 50),
      this.deps.rides.getAdminPassengerRideSummary(id),
      this.deps.support.listByPassenger(id, 50),
      this.deps.privacy.getPreferences('passenger', id),
    ]);
    if (privacy?.marketingNotificationsEnabled !== true)
      for (const ch of Object.keys(preference.channels) as Channel[])
        preference.channels[ch] = false;
    return {
      identity,
      preference,
      rides,
      completed: summary.completed,
      active: summary.active,
      tickets,
    };
  }
  async customers() {
    const output: Customer[] = [];
    let cursor: { updatedAt: string; id: string } | undefined;
    for (let page = 0; page < 10; page++) {
      const result = await this.deps.identities.listIdentities({
        subjectType: 'passenger',
        status: 'active',
        limit: 100,
        ...(cursor ? { cursor } : {}),
      });
      // A bounded batch avoids exhausting the VPS; pagination is explicit.
      for (let i = 0; i < result.identities.length; i += 10) {
        const batch = await Promise.all(
          result.identities
            .slice(i, i + 10)
            .map((i) => this.customer(i.subjectId)),
        );
        output.push(...batch.filter((c): c is Customer => c !== null));
      }
      if (!result.hasMore) return { customers: output, complete: true };
      const last = result.identities.at(-1);
      if (!last) break;
      cursor = { updatedAt: last.updatedAt, id: last.id };
    }
    return { customers: output, complete: false };
  }
  async issues(now = new Date()) {
    const [page, active, tickets, reviews, deliveries] = await Promise.all([
      this.deps.rides.listAdmin({
        limit: 200,
        createdFrom: new Date(now.getTime() - 7 * 86400000).toISOString(),
      }),
      this.deps.rides.listAdminActive(200),
      this.deps.support.listAdmin({ limit: 100 }),
      this.deps.store.reviews(),
      this.deps.store.deliveries(),
    ]);
    const rides = [
      ...new Map([...page.rides, ...active].map((r) => [r.id, r])).values(),
    ];
    const items = detectRideIssues(rides, tickets.tickets, now);
    const groups = new Map<string, RideRecord[]>();
    for (const ride of page.rides) {
      const key = `${ride.origin.zoneId}:${ride.category}`;
      groups.set(key, [...(groups.get(key) ?? []), ride]);
    }
    for (const [group, rs] of groups) {
      const misses = rs.filter((r) => r.state === 'NO_DRIVER_FOUND').length;
      if (rs.length >= 10 && misses / rs.length >= 0.2)
        items.push({
          key: `supply:${group}`,
          severity: 'warning',
          title: 'Muitos pedidos sem motorista',
          evidence: `${misses} de ${rs.length} corridas da amostra estão sem motorista (${Math.round((misses / rs.length) * 100)}%). Estados após reembolso não preservam necessariamente esse motivo.`,
          causes: ['Pouca disponibilidade', 'Recusas', 'Distância ou preço'],
          actions: [
            'Conferir frota e horários',
            'Investigar preços, distância e valor líquido',
            'Reduzir divulgação no período afetado',
          ],
          source: 'operation',
          sourceId: null,
          zone: rs[0]!.origin.zoneId,
          category: rs[0]!.category,
          at: now.toISOString(),
        });
    }
    // Offer metrics are sampled explicitly, rather than invented from cancelled rides.
    const offers = (
      await Promise.all(
        page.rides
          .slice(0, 50)
          .map((r) => this.deps.matching.listOffersForRide(r.id)),
      )
    ).flat();
    const rejected = offers.filter((o) => o.status === 'REJECTED').length;
    if (offers.length >= 10 && rejected / offers.length >= 0.4)
      items.push({
        key: 'offers:rejections',
        severity: 'warning',
        title: 'Muitas ofertas recusadas',
        evidence: `${rejected}/${offers.length} ofertas recusadas nas últimas ${Math.min(page.rides.length, 50)} corridas consultadas.`,
        causes: [
          'Preço ou valor líquido pouco atrativo',
          'Busca distante',
          'Horário ou destino',
        ],
        actions: [
          'Conferir valores e distância de busca',
          'Conversar com os motoristas antes de alterar preços',
        ],
        source: 'operation',
        sourceId: null,
        zone: null,
        category: null,
        at: now.toISOString(),
      });
    for (const d of deliveries) {
      if (
        d.state === 'processing' &&
        daysSince(now, d.createdAt) * 1440 >= 15
      ) {
        d.state = 'uncertain';
        await this.deps.store.finish(d);
      }
      if (
        d.state === 'uncertain' ||
        Object.values(d.results).some(
          (r) => r === 'failed' || r === 'uncertain',
        )
      )
        items.push({
          key: `delivery:${d.id}`,
          severity: 'warning',
          title: 'Comunicação com falha ou resultado incerto',
          evidence: `Campanha ${d.campaignId} · entrega ${d.id} · ${d.state}`,
          causes: [
            'Canal indisponível',
            'Interrupção durante o envio',
            'Token ou endereço inválido',
          ],
          actions: [
            'Conferir o provedor e o histórico',
            'Não repetir automaticamente um envio de resultado incerto',
          ],
          source: 'marketing',
          sourceId: d.id,
          zone: null,
          category: null,
          at: d.createdAt,
        });
    }
    const merged = items.map((i) => ({
      ...i,
      review: reviews.find((r) => r.key === i.key) ?? null,
      conditionPersists: true,
    }));
    const history = reviews
      .filter((r) => !items.some((i) => i.key === r.key))
      .map((r) => ({ ...r.issue, review: r, conditionPersists: false }));
    return {
      generatedAt: now.toISOString(),
      items: merged,
      history,
      coverage: {
        rideSample: page.rides.length,
        offerRideSample: Math.min(page.rides.length, 50),
        supportSample: tickets.tickets.length,
        limited: page.hasMore || tickets.hasMore || active.length === 200,
      },
      unmeasured: [
        'Instalações e abandono anterior à criação da corrida precisam de instrumentação adicional.',
        'GPS impreciso e incidentes de segurança dependem também de relatos e observabilidade.',
        'Desempenho de publicidade externa exige custos e atribuição registrados.',
      ],
    };
  }
  async availableZones(c: MarketingCampaign, now: Date) {
    const snapshot = await this.deps.catalog(),
      drivers = await this.deps.drivers.listOnline();
    const available = new Set<string>();
    for (const d of drivers) {
      if (
        d.busy ||
        d.reservedRideId ||
        daysSince(now, d.locationUpdatedAt) * 86400 > 120 ||
        !(await this.deps.canWork(d.driverId))
      )
        continue;
      try {
        const place = classifyCoordinateByCatalog({
          catalog: snapshot,
          latitude: d.latitude,
          longitude: d.longitude,
        });
        for (const category of d.categories)
          if (
            snapshot.categoryPolicies[category]?.enabled &&
            (c.categories.length === 0 || c.categories.includes(category))
          )
            available.add(`${place.zoneId}:${category}`);
      } catch {
        /* Unclassified or disabled zone does not count as available. */
      }
    }
    return available;
  }
  async occurrence(
    c: MarketingCampaign,
    u: Customer,
    now: Date,
  ): Promise<string | null> {
    if (c.trigger === 'coupon_expiring') {
      const ds = await this.deps.store.deliveries(
        undefined,
        u.identity.subjectId,
      );
      const reminders = ds.filter(
        (d) => d.campaignId === c.id && d.state === 'finished',
      );
      for (const d of ds.filter((d) => d.couponId)) {
        const p = await this.deps.promotions.findCampaignById(d.couponId!);
        if (
          p?.enabled &&
          !reminders.some((r) => r.occurrence === p.id) &&
          p.endsAt &&
          p.endsAt > now.toISOString() &&
          daysSince(new Date(p.endsAt), now.toISOString()) <= c.days &&
          (await this.deps.promotions.countRedeemed(p.id)) === 0
        )
          return p.id;
      }
      return null;
    }
    if (c.trigger === 'referral') {
      const already = await this.deps.store.deliveries(
        c.id,
        u.identity.subjectId,
      );
      const refs = (await this.deps.store.referrals()).filter(
        (r) => r.referrerId === u.identity.subjectId,
      );
      for (const ref of refs) {
        const rides = await this.deps.rides.listAdminRecentByPassengerId(
          ref.passengerId,
          50,
        );
        const first = rides
          .filter(
            (r) =>
              r.state === 'COMPLETED' &&
              r.paymentStatus === 'paid' &&
              r.quote.totalAmountCents > 0 &&
              r.createdAt >= ref.createdAt &&
              r.updatedAt >= ref.createdAt,
          )
          .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
        if (
          first &&
          !already.some(
            (d) => d.occurrence === first.id && d.state === 'finished',
          ) &&
          daysSince(now, first.updatedAt) <= c.days
        )
          return first.id;
      }
      return null;
    }
    return campaignOccurrence(c, u, now);
  }
  async preview(campaignId: string, now = new Date()) {
    const c = (await this.deps.store.campaigns()).find(
      (c) => c.id === campaignId,
    );
    if (!c) throw new GrowthError(404, 'Campanha não encontrada.');
    const [snapshot, s, deliveries] = await Promise.all([
      this.customers(),
      this.deps.store.settings(),
      this.deps.store.deliveries(),
    ]);
    const available = c.requireSupply
        ? await this.availableZones(c, now)
        : null,
      ready = this.deps.readiness();
    const candidates: {
      customer: Customer;
      occurrence: string;
      channels: Channel[];
      cost: number;
      control: boolean;
    }[] = [];
    const reasons: Record<string, number> = {};
    const skip = (r: string) => {
      reasons[r] = (reasons[r] ?? 0) + 1;
    };
    for (const u of snapshot.customers) {
      const reason = baseEligibility({ ...c, enabled: true }, u, now);
      if (reason) {
        skip(reason);
        continue;
      }
      const occurrence = await this.occurrence(c, u, now);
      if (!occurrence) {
        skip('Ainda não corresponde à regra');
        continue;
      }
      if (
        deliveries.some(
          (d) =>
            d.campaignId === c.id &&
            d.passengerId === u.identity.subjectId &&
            d.occurrence === occurrence,
        )
      ) {
        skip('Já processado para esta ocasião');
        continue;
      }
      let channels = c.channels.filter(
        (ch) =>
          u.preference.channels[ch] &&
          ready[ch] &&
          (ch !== 'email' || !!u.identity.emailNormalized),
      );
      if (!channels.length) {
        skip('Sem canal autorizado e disponível');
        continue;
      }
      const used = deliveries
        .filter(
          (d) =>
            !d.control &&
            d.passengerId === u.identity.subjectId &&
            daysSince(now, d.createdAt) < 7,
        )
        .reduce((sum, d) => sum + d.channels.length, 0);
      channels = channels.slice(0, Math.max(0, s.maxContactsPerWeek - used));
      if (!channels.length) {
        skip('Limite semanal alcançado');
        continue;
      }
      const zone = u.preference.zone ?? u.rides[0]?.origin.zoneId;
      if (
        available &&
        (!zone || ![...available].some((k) => k.startsWith(`${zone}:`)))
      ) {
        skip('Sem disponibilidade confirmada na região');
        continue;
      }
      const control =
        Number.parseInt(
          createHash('sha256')
            .update(`${c.id}:${u.identity.subjectId}`)
            .digest('hex')
            .slice(0, 8),
          16,
        ) %
          100 <
        c.controlPercent;
      candidates.push({
        customer: u,
        occurrence,
        channels,
        cost: control
          ? 0
          : c.couponValueCents +
            channels.reduce((s, ch) => s + c.channelCostCents[ch], 0),
        control,
      });
    }
    const own = deliveries.filter((d) => d.campaignId === c.id),
      held = own.reduce((s, d) => s + d.heldCents, 0);
    return {
      candidates,
      public: {
        campaign: c,
        settings: s,
        complete: snapshot.complete,
        scanned: snapshot.customers.length,
        eligible: candidates.length,
        control: candidates.filter((x) => x.control).length,
        estimatedMaximumCents: candidates.reduce((s, x) => s + x.cost, 0),
        reservedCents: held,
        remainingBudgetCents: Math.max(0, c.budgetCents - held),
        remainingRecipients: Math.max(0, c.maxRecipients - own.length),
        reasons,
        quiet: isQuiet(now, s),
        ready,
      },
    };
  }
  async execute(id: string, actor: AdminActor | null, now = new Date()) {
    const initial = (await this.deps.store.campaigns()).find(
      (c) => c.id === id,
    );
    if (!initial) throw new GrowthError(404, 'Campanha não encontrada.');
    if (!initial.enabled) throw new GrowthError(409, 'Campanha desligada.');
    const settings = await this.deps.store.settings();
    if (!settings.enabled)
      throw new GrowthError(409, 'Marketing desligado no controle geral.');
    if (isQuiet(now, settings))
      throw new GrowthError(409, 'Horário de silêncio: campanha não enviada.');
    if (!actor && !initial.automatic) return { reserved: 0, processed: 0 };
    const preview = await this.preview(id, now),
      c = preview.public.campaign;
    if (!preview.public.complete)
      throw new GrowthError(
        422,
        'A consulta alcançou o limite de 1.000 clientes. Nenhum envio foi iniciado; é necessário ampliar a paginação.',
      );
    if (actor)
      await this.deps.admin.appendAudit({
        id: randomUUID(),
        actor,
        action: 'marketing.execution.requested',
        targetType: 'marketing_campaign',
        targetId: id,
        metadata: { eligible: preview.public.eligible },
        createdAt: now.toISOString(),
      });
    let reserved = 0,
      processed = 0;
    for (const candidate of preview.candidates.slice(0, 100)) {
      const d: MarketingDelivery = {
        id: randomUUID(),
        campaignId: id,
        campaignVersion: c.updatedAt,
        passengerId: candidate.customer.identity.subjectId,
        occurrence: candidate.occurrence,
        createdAt: now.toISOString(),
        state: 'pending',
        heldCents: candidate.cost,
        control: candidate.control,
        title: c.title,
        message: c.message,
        couponId: null,
        channels: candidate.channels,
        results: {},
        openedAt: null,
      };
      if (await this.deps.store.reserve(d, c.updatedAt)) {
        reserved++;
        if (await this.process(d.id, now)) processed++;
      }
    }
    return {
      reserved,
      processed,
      eligible: preview.public.eligible,
      batchLimit: 100,
    };
  }
  async process(id: string, now = new Date()): Promise<boolean> {
    const d = await this.deps.store.claim(id);
    if (!d) return false;
    if (d.control) {
      d.state = 'finished';
      await this.deps.store.finish(d);
      return true;
    }
    try {
      const u = await this.customer(d.passengerId),
        settings = await this.deps.store.settings(),
        c = (await this.deps.store.campaigns()).find(
          (c) => c.id === d.campaignId,
        );
      if (
        !u ||
        !c ||
        c.updatedAt !== d.campaignVersion ||
        !settings.enabled ||
        isQuiet(now, settings) ||
        baseEligibility(c, u, now)
      ) {
        d.channels.forEach((ch) => (d.results[ch] = 'skipped'));
        d.state = 'finished';
        await this.deps.store.finish(d);
        return true;
      }
      // Re-evaluate condition immediately before delivery (e.g. a new completed ride).
      if ((await this.occurrence(c, u, now)) !== d.occurrence) {
        d.channels.forEach((ch) => (d.results[ch] = 'skipped'));
        d.state = 'finished';
        await this.deps.store.finish(d);
        return true;
      }
      if (c.requireSupply) {
        const available = await this.availableZones(c, now),
          zone = u.preference.zone ?? u.rides[0]?.origin.zoneId;
        if (!zone || ![...available].some((k) => k.startsWith(`${zone}:`))) {
          d.channels.forEach((ch) => (d.results[ch] = 'skipped'));
          d.state = 'finished';
          await this.deps.store.finish(d);
          return true;
        }
      }
      const authorized = d.channels.filter(
        (ch) => u.preference.channels[ch] && this.deps.readiness()[ch],
      );
      if (!authorized.length) {
        d.state = 'finished';
        await this.deps.store.finish(d);
        return true;
      }
      let coupon: string | null = null;
      if (c.couponValueCents > 0) {
        let gift = await this.deps.promotions.findCampaignById(d.id);
        if (!gift) {
          const record = createPromotionCampaignRecord({
            code: `RN_${d.id.replaceAll('-', '').slice(0, 24).toUpperCase()}`,
            name: c.name,
            kind: 'fixed_discount',
            valueCents: c.couponValueCents,
            categories: c.categories,
            maxRedemptions: 1,
            perPassengerLimit: 1,
            perDeviceLimit: 1,
            enabled: true,
            startsAt: now.toISOString(),
            endsAt: new Date(
              now.getTime() + c.couponValidDays * 86400000,
            ).toISOString(),
            now,
          });
          gift = await this.deps.promotions.createCampaign({
            ...record,
            id: d.id,
            targetPassengerId: d.passengerId,
            allowedZones: c.zones,
          });
        }
        if (
          !(await this.deps.store.deliveries(undefined, d.passengerId)).some(
            (x) => x.id === d.id,
          )
        ) {
          await this.deps.promotions.setCampaignEnabled(
            gift.id,
            false,
            now.toISOString(),
          );
          return true;
        }
        d.couponId = gift.id;
        coupon = gift.code;
        await this.deps.store.finish(d);
      }
      for (const channel of d.channels) {
        // The preference can be withdrawn while the earlier channel is sending.
        const latestPref = await this.deps.store.preference(d.passengerId),
          latestSettings = await this.deps.store.settings();
        const latestCampaign = (await this.deps.store.campaigns()).find(
          (c) => c.id === d.campaignId,
        );
        if (
          !latestPref.channels[channel] ||
          (await this.deps.privacy.getPreferences('passenger', d.passengerId))
            ?.marketingNotificationsEnabled !== true ||
          !latestSettings.enabled ||
          !latestCampaign?.enabled ||
          latestCampaign.updatedAt !== d.campaignVersion
        ) {
          d.results[channel] = 'skipped';
          await this.deps.store.finish(d);
          continue;
        }
        d.results[channel] = 'uncertain';
        await this.deps.store.finish(d);
        try {
          d.results[channel] = await this.deps.send(channel, u, d, coupon);
        } catch {
          d.results[channel] = 'uncertain';
        }
        await this.deps.store.finish(d);
      }
      d.state = 'finished';
      await this.deps.store.finish(d);
      return true;
    } catch {
      d.state = 'uncertain';
      await this.deps.store.finish(d);
      return true;
    }
  }
  async runAutomatic(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const settings = await this.deps.store.settings();
      if (!settings.enabled || isQuiet(now, settings)) return;
      for (const d of (await this.deps.store.deliveries())
        .filter((d) => d.state === 'pending')
        .slice(0, 100))
        await this.process(d.id, now);
      for (const c of (await this.deps.store.campaigns()).filter(
        (c) => c.enabled && c.automatic,
      )) {
        try {
          await this.execute(c.id, null, now);
        } catch (e) {
          if (!(e instanceof GrowthError)) throw e;
        }
      }
    } finally {
      this.running = false;
    }
  }
  async view() {
    const [settings, campaigns, deliveries] = await Promise.all([
      this.deps.store.settings(),
      this.deps.store.campaigns(),
      this.deps.store.deliveries(),
    ]);
    return {
      settings,
      templates: CAMPAIGN_TEMPLATES,
      channels: this.deps.readiness(),
      campaigns: campaigns.map((c) => {
        const ds = deliveries.filter((d) => d.campaignId === c.id);
        return {
          ...c,
          metrics: {
            processed: ds.length,
            contacted: ds.filter((d) =>
              Object.values(d.results).some(
                (r) => r === 'accepted' || r === 'published',
              ),
            ).length,
            control: ds.filter((d) => d.control).length,
            opened: ds.filter((d) => d.openedAt).length,
            uncertain: ds.filter((d) => d.state === 'uncertain').length,
            reservedCents: ds.reduce((s, d) => s + d.heldCents, 0),
          },
        };
      }),
      notes: [
        'Reserva inclui o valor máximo dos presentes e custos por canal informados pelo administrador. Cobranças reais devem ser conferidas em Custos & Resultado.',
        'Aceito pelo provedor não significa lido ou entregue no aparelho.',
        'A automação usa lotes de até 100 destinatários. Resultado incerto nunca é reenviado automaticamente.',
      ],
    };
  }
  async report(id: string, now = new Date()) {
    const c = (await this.deps.store.campaigns()).find((c) => c.id === id);
    if (!c) throw new GrowthError(404, 'Campanha não encontrada.');
    const ds = await this.deps.store.deliveries(id),
      groups = {
        contact: {
          assigned: 0,
          observed: 0,
          converted: 0,
          redeemed: 0,
          commissionCents: 0,
        },
        control: {
          assigned: 0,
          observed: 0,
          converted: 0,
          redeemed: 0,
          commissionCents: 0,
        },
      };
    for (const d of ds) {
      const g = d.control ? groups.control : groups.contact;
      g.assigned++;
      if (daysSince(now, d.createdAt) < 14) continue;
      g.observed++;
      const u = await this.customer(d.passengerId);
      if (!u) continue;
      const rides = u.rides.filter(
        (r) =>
          r.state === 'COMPLETED' &&
          r.createdAt >= d.createdAt &&
          Date.parse(r.createdAt) < Date.parse(d.createdAt) + 14 * 86400000 &&
          (c.categories.length === 0 || c.categories.includes(r.category)) &&
          (c.zones.length === 0 || c.zones.includes(r.origin.zoneId)),
      );
      if (rides.length) g.converted++;
      g.commissionCents += rides.reduce(
        (s, r) => s + r.quote.platformCommissionCents,
        0,
      );
      if (d.couponId)
        g.redeemed += await this.deps.promotions.countRedeemed(d.couponId);
    }
    return {
      campaignId: id,
      groups,
      windowDays: 14,
      interpretation:
        'Conversões observadas na janela de 14 dias entre clientes com observação completa. São associações; comparar os grupos ajuda a estimar efeito adicional. O histórico considera até 50 corridas recentes por cliente. Comissão bruta não é lucro nem retorno incremental comprovado.',
    };
  }
  async forget(id: string) {
    await this.deps.store.forget(id);
    for (const gift of await this.deps.promotions.listCampaigns())
      if (gift.targetPassengerId === id && gift.enabled)
        await this.deps.promotions.setCampaignEnabled(
          gift.id,
          false,
          new Date().toISOString(),
        );
  }
  async passengerView(id: string) {
    const pref =
        (await this.customer(id))?.preference ??
        (await this.deps.store.preference(id)),
      ds = await this.deps.store.deliveries(undefined, id),
      benefits = [];
    for (const d of ds.filter((d) => d.couponId && !d.control)) {
      const c = await this.deps.promotions.findCampaignById(d.couponId!);
      if (!c) continue;
      benefits.push({
        id: c.id,
        name: c.name,
        code: c.code,
        valueCents: c.valueCents,
        endsAt: c.endsAt,
        enabled: c.enabled,
        redeemed: (await this.deps.promotions.countRedeemed(c.id)) > 0,
        categories: c.categories,
        zones: c.allowedZones ?? [],
      });
    }
    return {
      preference: pref,
      messages: ds
        .filter((d) => d.results.inapp === 'published' && !d.control)
        .map((d) => ({
          id: d.id,
          title: d.title,
          message: d.message,
          createdAt: d.createdAt,
          openedAt: d.openedAt,
        })),
      benefits,
    };
  }
}
