import { randomUUID } from 'node:crypto';
import type { AdminActor, AdminRepository } from './admin-repository.js';
import {
  createPromotionCampaignRecord,
  PromotionError,
} from '../promotions/promotion-service.js';
import type {
  PromotionRepository,
  PromotionKind,
  PromotionCategory,
} from '../promotions/promotion-repository.js';
function invalid(message: string): never {
  throw new PromotionError('INVALID_PROMOTION_CAMPAIGN', message);
}
function object(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value))
    invalid('Dados da campanha inválidos.');
  return value as Record<string, unknown>;
}
export function parseAdminPromotion(body: unknown) {
  const value = object(body);
  const fields = [
    'code',
    'name',
    'kind',
    'valueCents',
    'percentBps',
    'maxDiscountCents',
    'fixedDriverFareCents',
    'fixedDriverFaresByCategory',
    'categories',
    'maxRedemptions',
    'perPassengerLimit',
    'perDeviceLimit',
    'startsAt',
    'endsAt',
    'enabled',
  ];
  if (Object.keys(value).some((key) => !fields.includes(key)))
    invalid('Campo de campanha desconhecido.');
  for (const key of ['code', 'name', 'kind'])
    if (typeof value[key] !== 'string') invalid(`${key} é obrigatório.`);
  for (const key of [
    'valueCents',
    'percentBps',
    'maxDiscountCents',
    'fixedDriverFareCents',
    'maxRedemptions',
    'perPassengerLimit',
    'perDeviceLimit',
  ]) {
    if (value[key] !== undefined && typeof value[key] !== 'number')
      invalid(`${key} deve ser inteiro.`);
  }
  if (value.maxRedemptions == null) invalid('Defina o limite total de usos.');
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean')
    invalid('Ativação inválida.');
  for (const key of ['startsAt', 'endsAt'])
    if (value[key] !== undefined && typeof value[key] !== 'string')
      invalid(`${key} deve ser uma data.`);
  if (
    value.categories !== undefined &&
    (!Array.isArray(value.categories) ||
      value.categories.some((item) => typeof item !== 'string'))
  )
    invalid('Categorias inválidas.');
  if (
    value.fixedDriverFaresByCategory !== undefined &&
    Object.values(object(value.fixedDriverFaresByCategory)).some(
      (fare) => typeof fare !== 'number',
    )
  )
    invalid('Tarifas devem ser inteiros em centavos.');
  const relevant: Record<string, string[]> = {
    wallet_credit: ['valueCents'],
    fixed_discount: ['valueCents'],
    percent_discount: ['percentBps', 'maxDiscountCents'],
    free_ride: [],
    fixed_driver_fare: ['fixedDriverFareCents', 'fixedDriverFaresByCategory'],
  };
  if (!Object.hasOwn(relevant, String(value.kind)))
    invalid('Tipo de cupom inválido.');
  for (const key of [
    'valueCents',
    'percentBps',
    'maxDiscountCents',
    'fixedDriverFareCents',
    'fixedDriverFaresByCategory',
  ]) {
    if (
      value[key] !== undefined &&
      !relevant[String(value.kind)]?.includes(key)
    )
      invalid('Valor incompatível com o tipo de cupom.');
  }
  return createPromotionCampaignRecord({
    code: value.code as string,
    name: value.name as string,
    kind: value.kind as PromotionKind,
    maxRedemptions: value.maxRedemptions as number,
    ...(value.categories === undefined
      ? {}
      : { categories: value.categories as PromotionCategory[] }),
    ...(value.valueCents === undefined
      ? {}
      : { valueCents: value.valueCents as number }),
    ...(value.percentBps === undefined
      ? {}
      : { percentBps: value.percentBps as number }),
    ...(value.maxDiscountCents === undefined
      ? {}
      : { maxDiscountCents: value.maxDiscountCents as number }),
    ...(value.fixedDriverFareCents === undefined
      ? {}
      : { fixedDriverFareCents: value.fixedDriverFareCents as number }),
    ...(value.fixedDriverFaresByCategory === undefined
      ? {}
      : {
          fixedDriverFaresByCategory:
            value.fixedDriverFaresByCategory as Partial<
              Record<PromotionCategory, number>
            >,
        }),
    ...(value.perPassengerLimit === undefined
      ? {}
      : { perPassengerLimit: value.perPassengerLimit as number }),
    ...(value.perDeviceLimit === undefined
      ? {}
      : { perDeviceLimit: value.perDeviceLimit as number }),
    ...(value.startsAt === undefined
      ? {}
      : { startsAt: value.startsAt as string }),
    ...(value.endsAt === undefined ? {} : { endsAt: value.endsAt as string }),
    enabled: value.enabled === true,
  });
}
export function parseAdminPromotionEnabled(body: unknown): boolean {
  const value = object(body);
  if (
    Object.keys(value).some((key) => key !== 'enabled') ||
    typeof value.enabled !== 'boolean'
  )
    invalid('Informe somente enabled como verdadeiro ou falso.');
  return value.enabled;
}
type Dependencies = {
  promotions: PromotionRepository;
  admin: AdminRepository;
  actor: AdminActor;
  body: unknown;
};
export async function createAdminPromotion(input: Dependencies) {
  const campaign = await input.promotions.createCampaign(
    parseAdminPromotion(input.body),
  );
  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'promotions.campaign_created',
    targetType: 'promotion_campaign',
    targetId: campaign.id,
    metadata: {
      code: campaign.code,
      kind: campaign.kind,
      enabled: campaign.enabled,
      maxRedemptions: campaign.maxRedemptions,
    },
    createdAt: campaign.createdAt,
  });
  return campaign;
}
export async function setAdminPromotionEnabled(
  input: Dependencies & { id: string },
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.id,
    )
  )
    invalid('Identificador inválido.');
  const campaign = await input.promotions.setCampaignEnabled(
    input.id,
    parseAdminPromotionEnabled(input.body),
    new Date().toISOString(),
  );
  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'promotions.campaign_enabled_changed',
    targetType: 'promotion_campaign',
    targetId: campaign.id,
    metadata: { code: campaign.code, enabled: campaign.enabled },
    createdAt: campaign.updatedAt,
  });
  return campaign;
}
