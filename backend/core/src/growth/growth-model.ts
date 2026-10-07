import { randomUUID } from 'node:crypto';
import type { ServiceCategory, ZoneId } from '../pricing/types.js';

export const CHANNELS = ['inapp', 'push', 'email', 'whatsapp'] as const;
export type Channel = (typeof CHANNELS)[number];
export const TRIGGERS = [
  'birthday',
  'calendar',
  'never_used',
  'inactive',
  'first_ride',
  'loyalty',
  'no_driver',
  'abandoned',
  'coupon_expiring',
  'referral',
  'support_resolved',
] as const;
export type Trigger = (typeof TRIGGERS)[number];
export class GrowthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GrowthError';
  }
}
export interface MarketingSettings {
  enabled: boolean;
  maxContactsPerWeek: number;
  quietStartHour: number;
  quietEndHour: number;
  updatedAt: string;
}
export const DEFAULT_SETTINGS: MarketingSettings = {
  enabled: false,
  maxContactsPerWeek: 2,
  quietStartHour: 21,
  quietEndHour: 8,
  updatedAt: '1970-01-01T00:00:00.000Z',
};
export interface MarketingPreference {
  passengerId: string;
  channels: Record<Channel, boolean>;
  birthdayMonthDay: string | null;
  audience: 'unspecified' | 'resident' | 'tourist';
  zone: ZoneId | null;
  updatedAt: string;
}
export function defaultPreference(passengerId: string): MarketingPreference {
  return {
    passengerId,
    channels: { inapp: false, push: false, email: false, whatsapp: false },
    birthdayMonthDay: null,
    audience: 'unspecified',
    zone: null,
    updatedAt: '1970-01-01T00:00:00.000Z',
  };
}
export interface MarketingCampaign {
  id: string;
  name: string;
  trigger: Trigger;
  days: number;
  threshold: number;
  calendarDay: string | null;
  title: string;
  message: string;
  channels: Channel[];
  zones: ZoneId[];
  categories: ServiceCategory[];
  audience: 'all' | 'resident' | 'tourist';
  enabled: boolean;
  automatic: boolean;
  repeatAnnually?: boolean;
  requireSupply: boolean;
  startsAt: string;
  endsAt: string;
  couponValueCents: number;
  couponValidDays: number;
  budgetCents: number;
  maxRecipients: number;
  channelCostCents: Record<Channel, number>;
  controlPercent: number;
  createdAt: string;
  updatedAt: string;
}
export interface MarketingDelivery {
  id: string;
  campaignId: string;
  campaignVersion: string;
  passengerId: string;
  occurrence: string;
  createdAt: string;
  state: 'pending' | 'processing' | 'finished' | 'uncertain';
  heldCents: number;
  control: boolean;
  title: string;
  message: string;
  couponId: string | null;
  channels: Channel[];
  results: Partial<
    Record<
      Channel,
      'published' | 'accepted' | 'failed' | 'uncertain' | 'skipped'
    >
  >;
  openedAt: string | null;
}
export interface Issue {
  key: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  evidence: string;
  causes: string[];
  actions: string[];
  source: 'ride' | 'support' | 'operation' | 'marketing';
  sourceId: string | null;
  zone: string | null;
  category: string | null;
  at: string;
}
export interface IssueReview {
  key: string;
  status: 'new' | 'in_progress' | 'resolved';
  owner: string;
  notes: string;
  updatedAt: string;
  issue: Issue;
}
export interface Referral {
  code: string;
  referrerId: string;
  passengerId: string;
  createdAt: string;
}
const zones: ZoneId[] = ['prea', 'jijoca', 'jericoacoara', 'external'];
const categories: ServiceCategory[] = [
  'moto',
  'delivery',
  'car',
  'comfort_black',
  'buggy',
];
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new GrowthError(400, 'Dados inválidos.');
  return value as Record<string, unknown>;
}
export function textValue(
  value: unknown,
  max: number,
  label: string,
  min = 0,
): string {
  if (typeof value !== 'string')
    throw new GrowthError(400, `${label} inválido.`);
  const v = value.trim();
  if (
    v.length < min ||
    v.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
  )
    throw new GrowthError(400, `${label} inválido.`);
  return v;
}
export function intValue(
  v: unknown,
  min: number,
  max: number,
  label: string,
): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max)
    throw new GrowthError(400, `${label} inválido.`);
  return v;
}
function bool(v: unknown, label: string): boolean {
  if (typeof v !== 'boolean') throw new GrowthError(400, `${label} inválido.`);
  return v;
}
function choices<T extends string>(
  v: unknown,
  allowed: readonly T[],
  label: string,
  minimum = 0,
): T[] {
  if (
    !Array.isArray(v) ||
    v.length < minimum ||
    v.length > allowed.length ||
    v.some((x) => !allowed.includes(x))
  )
    throw new GrowthError(400, `${label} inválido.`);
  return [...new Set(v)] as T[];
}
export function monthDay(v: unknown): string | null {
  if (v === null || v === '') return null;
  const day = textValue(v, 5, 'Dia e mês');
  if (
    !/^\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(`2000-${day}T12:00:00Z`)) ||
    new Date(`2000-${day}T12:00:00Z`).toISOString().slice(5, 10) !== day
  )
    throw new GrowthError(400, 'Informe um dia e mês válidos.');
  return day;
}
function instant(v: unknown): string {
  const s = textValue(v, 40, 'Data');
  if (!Number.isFinite(Date.parse(s)))
    throw new GrowthError(400, 'Data inválida.');
  return new Date(s).toISOString();
}
export function preferenceInput(
  passengerId: string,
  value: unknown,
  now = new Date(),
): MarketingPreference {
  const b = object(value),
    c = object(b.channels);
  const channels = Object.fromEntries(
    CHANNELS.map((k) => [k, bool(c[k], k)]),
  ) as Record<Channel, boolean>;
  if (!['unspecified', 'resident', 'tourist'].includes(String(b.audience)))
    throw new GrowthError(400, 'Perfil inválido.');
  if (b.zone !== null && !zones.includes(b.zone as ZoneId))
    throw new GrowthError(400, 'Região inválida.');
  return {
    passengerId,
    channels,
    birthdayMonthDay: monthDay(b.birthdayMonthDay),
    audience: b.audience as MarketingPreference['audience'],
    zone: b.zone as ZoneId | null,
    updatedAt: now.toISOString(),
  };
}
export function settingsInput(
  value: unknown,
  now = new Date(),
): MarketingSettings {
  const b = object(value);
  return {
    enabled: bool(b.enabled, 'Ativação'),
    maxContactsPerWeek: intValue(b.maxContactsPerWeek, 1, 7, 'Limite semanal'),
    quietStartHour: intValue(b.quietStartHour, 0, 23, 'Início do silêncio'),
    quietEndHour: intValue(b.quietEndHour, 0, 23, 'Fim do silêncio'),
    updatedAt: now.toISOString(),
  };
}
export function campaignInput(
  value: unknown,
  old?: MarketingCampaign,
  now = new Date(),
): MarketingCampaign {
  const b = object(value);
  if (!TRIGGERS.includes(b.trigger as Trigger))
    throw new GrowthError(400, 'Tipo de campanha inválido.');
  const startsAt = instant(b.startsAt),
    endsAt = instant(b.endsAt);
  if (startsAt >= endsAt)
    throw new GrowthError(400, 'A data final deve ser posterior à inicial.');
  const calendarDay = monthDay(b.calendarDay ?? null);
  if (b.trigger === 'calendar' && !calendarDay)
    throw new GrowthError(400, 'Escolha o dia e mês da campanha.');
  if (!['all', 'resident', 'tourist'].includes(String(b.audience)))
    throw new GrowthError(400, 'Público inválido.');
  const repeatAnnually =
    b.repeatAnnually === undefined
      ? (old?.repeatAnnually ?? false)
      : bool(b.repeatAnnually, 'Repetição anual');
  if (repeatAnnually && b.trigger !== 'birthday' && b.trigger !== 'calendar')
    throw new GrowthError(
      400,
      'Repetição anual disponível para aniversário e data fixa.',
    );
  const cost = object(b.channelCostCents);
  return {
    id: old?.id ?? randomUUID(),
    name: textValue(b.name, 80, 'Nome', 3),
    trigger: b.trigger as Trigger,
    days: intValue(b.days, 1, 365, 'Dias'),
    threshold: intValue(b.threshold, 1, 1000, 'Quantidade'),
    calendarDay,
    title: textValue(b.title, 80, 'Título', 3),
    message: textValue(b.message, 500, 'Mensagem', 3),
    channels: choices(b.channels, CHANNELS, 'Canais', 1),
    zones: choices(b.zones, zones, 'Regiões'),
    categories: choices(b.categories, categories, 'Categorias'),
    audience: b.audience as MarketingCampaign['audience'],
    enabled: old ? bool(b.enabled, 'Ativação') : false,
    automatic: bool(b.automatic, 'Automação'),
    repeatAnnually,
    requireSupply: bool(b.requireSupply, 'Disponibilidade'),
    startsAt,
    endsAt,
    couponValueCents: intValue(
      b.couponValueCents,
      0,
      50000,
      'Valor do presente',
    ),
    couponValidDays: intValue(b.couponValidDays, 1, 30, 'Validade do presente'),
    budgetCents: intValue(b.budgetCents, 0, 100000000, 'Orçamento'),
    maxRecipients: intValue(b.maxRecipients, 1, 100000, 'Destinatários'),
    channelCostCents: Object.fromEntries(
      CHANNELS.map((k) => [k, intValue(cost[k], 0, 100000, 'Custo por canal')]),
    ) as Record<Channel, number>,
    controlPercent: intValue(b.controlPercent, 0, 50, 'Grupo de comparação'),
    createdAt: old?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
export function localClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const val = (k: string) => parts.find((p) => p.type === k)!.value;
  return {
    day: `${val('year')}-${val('month')}-${val('day')}`,
    monthDay: `${val('month')}-${val('day')}`,
    hour: Number(val('hour')),
  };
}
export function isQuiet(now: Date, s: MarketingSettings): boolean {
  const h = localClock(now).hour;
  return s.quietStartHour === s.quietEndHour
    ? false
    : s.quietStartHour > s.quietEndHour
      ? h >= s.quietStartHour || h < s.quietEndHour
      : h >= s.quietStartHour && h < s.quietEndHour;
}
export const CAMPAIGN_TEMPLATES = [
  {
    name: 'Aniversário do cliente',
    trigger: 'birthday',
    days: 1,
    threshold: 1,
    calendarDay: null,
  },
  {
    name: 'Natal',
    trigger: 'calendar',
    calendarDay: '12-25',
    days: 1,
    threshold: 1,
  },
  {
    name: 'Ano-Novo',
    trigger: 'calendar',
    calendarDay: '01-01',
    days: 1,
    threshold: 1,
  },
  ...[
    ['Dia do Cliente', '09-15'],
    ['Dia do Trabalhador', '05-01'],
    ['São João', '06-24'],
  ].map(([name, calendarDay]) => ({
    name: name!,
    trigger: 'calendar',
    calendarDay: calendarDay!,
    days: 1,
    threshold: 1,
  })),
  {
    name: 'Primeira corrida',
    trigger: 'first_ride',
    days: 7,
    threshold: 1,
    calendarDay: null,
  },
  {
    name: 'Volte ao Ramo Nessa',
    trigger: 'inactive',
    days: 15,
    threshold: 1,
    calendarDay: null,
  },
  {
    name: 'Experimente sua primeira corrida',
    trigger: 'never_used',
    days: 3,
    threshold: 1,
    calendarDay: null,
  },
  {
    name: 'Cliente frequente',
    trigger: 'loyalty',
    days: 30,
    threshold: 10,
    calendarDay: null,
  },
  {
    name: 'Nova chance de encontrar motorista',
    trigger: 'no_driver',
    days: 3,
    threshold: 1,
    calendarDay: null,
  },
  {
    name: 'Pedido não concluído',
    trigger: 'abandoned',
    days: 1,
    threshold: 1,
    calendarDay: null,
  },
  {
    name: 'Seu benefício está vencendo',
    trigger: 'coupon_expiring',
    days: 2,
    threshold: 1,
    calendarDay: null,
  },
  {
    name: 'Obrigado por indicar',
    trigger: 'referral',
    days: 30,
    threshold: 1,
    calendarDay: null,
  },
  {
    name: 'Como foi a solução do chamado?',
    trigger: 'support_resolved',
    days: 7,
    threshold: 1,
    calendarDay: null,
  },
];
