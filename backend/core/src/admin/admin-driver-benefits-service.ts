import { randomUUID } from 'node:crypto';

import type {
  DriverBenefitCampaignRecord,
  DriverBenefitCampaignStatus,
  DriverBenefitCategory,
  DriverBenefitMission,
  DriverBenefitParticipantMode,
  DriverBenefitPrize,
  DriverBenefitRegion,
  DriverBenefitRegionMode,
  DriverBenefitRepository,
} from '../benefits/driver-benefit-repository.js';
import {
  DRIVER_BENEFIT_CATEGORIES,
} from '../benefits/driver-benefit-repository.js';
import {
  DriverBenefitError,
  normalizeBenefitPrizes,
} from '../benefits/driver-benefit-service.js';
import type {
  AdminActor,
  AdminRepository,
} from './admin-repository.js';

function invalid(message: string): never {
  throw new DriverBenefitError(
    'INVALID_DRIVER_BENEFIT',
    message,
  );
}

function object(value: unknown): Record<string, unknown> {
  if (
    value == null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    invalid('Dados de Ranking & Benefícios inválidos.');
  }
  return value as Record<string, unknown>;
}

function cleanText(
  value: unknown,
  label: string,
  min: number,
  max: number,
): string {
  if (typeof value !== 'string') invalid(`${label} é obrigatório.`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length < min ||
    normalized.length > max ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    invalid(`${label} é inválido.`);
  }
  return normalized;
}

function integer(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    invalid(`${label} deve ficar entre ${min} e ${max}.`);
  }
  return value;
}

function stringList(
  value: unknown,
  label: string,
): string[] {
  if (!Array.isArray(value)) invalid(`${label} deve ser uma lista.`);
  const normalized = value.map((item) =>
    cleanText(item, label, 1, 120),
  );
  return [...new Set(normalized)];
}

function parseRegions(value: unknown): DriverBenefitRegion[] {
  if (!Array.isArray(value)) invalid('Regiões devem ser uma lista.');
  if (value.length > 50) invalid('Limite de 50 regiões por campanha.');
  return value.map((item) => {
    const entry = object(item);
    if (
      Object.keys(entry).some(
        (key) => key !== 'zoneId' && key !== 'localityId',
      )
    ) {
      invalid('Região contém campo desconhecido.');
    }
    const zoneId = cleanText(entry.zoneId, 'Zona', 1, 80);
    const localityId =
      entry.localityId == null || entry.localityId === ''
        ? undefined
        : cleanText(entry.localityId, 'Localidade', 1, 120);
    return {
      zoneId,
      ...(localityId == null ? {} : { localityId }),
    };
  });
}

function parseMissions(value: unknown): DriverBenefitMission[] {
  if (!Array.isArray(value)) invalid('Missões devem ser uma lista.');
  if (value.length > 20) invalid('Limite de 20 missões por campanha.');
  const ids = new Set<string>();
  return value.map((item) => {
    const entry = object(item);
    const id = cleanText(entry.id, 'ID da missão', 1, 50);
    if (ids.has(id)) invalid('IDs de missão devem ser únicos.');
    ids.add(id);
    const kind = entry.kind;
    if (
      kind !== 'completed_rides' &&
      kind !== 'five_star_ratings'
    ) {
      invalid('Tipo de missão inválido.');
    }
    return {
      id,
      title: cleanText(entry.title, 'Título da missão', 3, 100),
      kind,
      target: integer(entry.target, 'Meta da missão', 1, 100000),
      bonusPoints: integer(
        entry.bonusPoints,
        'Bônus da missão',
        0,
        100000,
      ),
    };
  });
}

function parsePrizes(value: unknown): DriverBenefitPrize[] {
  if (!Array.isArray(value)) invalid('Prêmios devem ser uma lista.');
  if (value.length > 50) invalid('Limite de 50 prêmios por campanha.');
  const ranks = new Set<number>();
  const prizes = value.map((item) => {
    const entry = object(item);
    const rank = integer(entry.rank, 'Posição do prêmio', 1, 50);
    if (ranks.has(rank)) invalid('Cada posição pode ter somente um prêmio.');
    ranks.add(rank);
    return {
      rank,
      label: cleanText(entry.label, 'Descrição do prêmio', 2, 160),
    };
  });
  return normalizeBenefitPrizes(prizes);
}

function parseCampaignFields(value: Record<string, unknown>) {
  const category = value.category;
  if (
    typeof category !== 'string' ||
    !DRIVER_BENEFIT_CATEGORIES.includes(
      category as DriverBenefitCategory,
    )
  ) {
    invalid('Categoria inválida.');
  }

  const regionMode = value.regionMode;
  if (
    regionMode !== 'ride' &&
    regionMode !== 'driver_base' &&
    regionMode !== 'both'
  ) {
    invalid('Regra territorial inválida.');
  }

  const participantMode = value.participantMode;
  if (
    participantMode !== 'eligible' &&
    participantMode !== 'selected'
  ) {
    invalid('Regra de participantes inválida.');
  }

  const startsAt = cleanText(value.startsAt, 'Início', 10, 40);
  const endsAt = cleanText(value.endsAt, 'Fim', 10, 40);
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    invalid('Período da campanha é inválido.');
  }

  const participants = stringList(
    value.participantDriverIds ?? [],
    'Motorista participante',
  );
  if (
    participantMode === 'selected' &&
    participants.length === 0
  ) {
    invalid('Selecione ao menos um motorista para a campanha fechada.');
  }

  const excluded = stringList(
    value.excludedDriverIds ?? [],
    'Motorista excluído',
  );

  return {
    name: cleanText(value.name, 'Nome da campanha', 3, 100),
    category: category as DriverBenefitCategory,
    regionMode: regionMode as DriverBenefitRegionMode,
    participantMode:
      participantMode as DriverBenefitParticipantMode,
    regions: parseRegions(value.regions ?? []),
    participantDriverIds: participants,
    excludedDriverIds: excluded,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString(),
    topCount: integer(value.topCount, 'Quantidade premiada', 1, 50),
    minParticipants: integer(
      value.minParticipants,
      'Mínimo de participantes',
      1,
      10000,
    ),
    ridePoints: integer(
      value.ridePoints,
      'Pontos por corrida',
      0,
      100000,
    ),
    fiveStarPoints: integer(
      value.fiveStarPoints,
      'Pontos por 5 estrelas',
      0,
      100000,
    ),
    fourStarPoints: integer(
      value.fourStarPoints,
      'Pontos por 4 estrelas',
      0,
      100000,
    ),
    lowCancellationMaxBps: integer(
      value.lowCancellationMaxBps,
      'Limite de cancelamento',
      0,
      10000,
    ),
    lowCancellationBonusPoints: integer(
      value.lowCancellationBonusPoints,
      'Bônus de qualidade',
      0,
      100000,
    ),
    missions: parseMissions(value.missions ?? []),
    prizes: parsePrizes(value.prizes ?? []),
  };
}

export function parseCreateDriverBenefitCampaign(
  body: unknown,
  now = new Date(),
): DriverBenefitCampaignRecord {
  const value = object(body);
  const fields = parseCampaignFields(value);
  const instant = now.toISOString();
  return {
    id: randomUUID(),
    ...fields,
    status: 'draft',
    createdAt: instant,
    updatedAt: instant,
  };
}

export function parseDriverBenefitCampaignPatch(
  current: DriverBenefitCampaignRecord,
  body: unknown,
  now = new Date(),
): DriverBenefitCampaignRecord {
  const value = object(body);
  const allowed = new Set([
    'name',
    'category',
    'regionMode',
    'participantMode',
    'regions',
    'participantDriverIds',
    'excludedDriverIds',
    'startsAt',
    'endsAt',
    'topCount',
    'minParticipants',
    'ridePoints',
    'fiveStarPoints',
    'fourStarPoints',
    'lowCancellationMaxBps',
    'lowCancellationBonusPoints',
    'missions',
    'prizes',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    invalid('Campo de campanha desconhecido.');
  }
  const merged = {
    name: current.name,
    category: current.category,
    regionMode: current.regionMode,
    participantMode: current.participantMode,
    regions: current.regions,
    participantDriverIds: current.participantDriverIds,
    excludedDriverIds: current.excludedDriverIds,
    startsAt: current.startsAt,
    endsAt: current.endsAt,
    topCount: current.topCount,
    minParticipants: current.minParticipants,
    ridePoints: current.ridePoints,
    fiveStarPoints: current.fiveStarPoints,
    fourStarPoints: current.fourStarPoints,
    lowCancellationMaxBps: current.lowCancellationMaxBps,
    lowCancellationBonusPoints:
      current.lowCancellationBonusPoints,
    missions: current.missions,
    prizes: current.prizes,
    ...value,
  };
  return {
    ...current,
    ...parseCampaignFields(merged),
    updatedAt: now.toISOString(),
  };
}

export function parseDriverBenefitStatus(
  body: unknown,
): DriverBenefitCampaignStatus {
  const value = object(body);
  if (
    Object.keys(value).some((key) => key !== 'status') ||
    (
      value.status !== 'draft' &&
      value.status !== 'scheduled' &&
      value.status !== 'active' &&
      value.status !== 'paused' &&
      value.status !== 'ended'
    )
  ) {
    invalid('Status de campanha inválido.');
  }
  return value.status;
}

export function parseDriverBenefitGlobalEnabled(
  body: unknown,
): boolean {
  const value = object(body);
  if (
    Object.keys(value).some((key) => key !== 'enabled') ||
    typeof value.enabled !== 'boolean'
  ) {
    invalid('Informe somente enabled como verdadeiro ou falso.');
  }
  return value.enabled;
}

function parseDriverBenefitBase(body: unknown) {
  const value = object(body);
  if (
    Object.keys(value).some(
      (key) => key !== 'zoneId' && key !== 'localityId',
    )
  ) {
    throw new DriverBenefitError(
      'INVALID_DRIVER_BENEFIT_BASE',
      'Base territorial contém campo desconhecido.',
    );
  }
  const zoneId = cleanText(value.zoneId, 'Zona da base', 1, 80);
  const localityId =
    value.localityId == null || value.localityId === ''
      ? undefined
      : cleanText(value.localityId, 'Localidade da base', 1, 120);
  return {
    zoneId,
    ...(localityId == null ? {} : { localityId }),
  };
}

export async function setDriverBenefitsGlobalEnabled(input: {
  repository: DriverBenefitRepository;
  admin: AdminRepository;
  actor: AdminActor;
  body: unknown;
  now?: Date;
}) {
  const enabled = parseDriverBenefitGlobalEnabled(input.body);
  const instant = (input.now ?? new Date()).toISOString();
  const previous = await input.repository.getSettings();
  const settings = await input.repository.updateSettings({
    enabled,
    updatedAt: instant,
  });
  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'driver_benefits.global_enabled_changed',
    targetType: 'driver_benefit_settings',
    targetId: 'global',
    metadata: {
      previousEnabled: previous.enabled,
      enabled: settings.enabled,
    },
    createdAt: instant,
  });
  return settings;
}

export async function createDriverBenefitCampaign(input: {
  repository: DriverBenefitRepository;
  admin: AdminRepository;
  actor: AdminActor;
  body: unknown;
  now?: Date;
}) {
  const campaign = await input.repository.createCampaign(
    parseCreateDriverBenefitCampaign(
      input.body,
      input.now ?? new Date(),
    ),
  );
  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'driver_benefits.campaign_created',
    targetType: 'driver_benefit_campaign',
    targetId: campaign.id,
    metadata: {
      name: campaign.name,
      category: campaign.category,
      status: campaign.status,
    },
    createdAt: campaign.createdAt,
  });
  return campaign;
}

export async function updateDriverBenefitCampaign(input: {
  repository: DriverBenefitRepository;
  admin: AdminRepository;
  actor: AdminActor;
  id: string;
  body: unknown;
  now?: Date;
}) {
  const current = await input.repository.findCampaign(input.id);
  if (current == null) {
    throw new DriverBenefitError(
      'DRIVER_BENEFIT_NOT_FOUND',
      'Campanha de Ranking & Benefícios não encontrada.',
    );
  }
  const updated = await input.repository.updateCampaign(
    parseDriverBenefitCampaignPatch(
      current,
      input.body,
      input.now ?? new Date(),
    ),
  );
  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'driver_benefits.campaign_updated',
    targetType: 'driver_benefit_campaign',
    targetId: updated.id,
    metadata: {
      name: updated.name,
      category: updated.category,
      status: updated.status,
    },
    createdAt: updated.updatedAt,
  });
  return updated;
}

export async function setDriverBenefitCampaignStatus(input: {
  repository: DriverBenefitRepository;
  admin: AdminRepository;
  actor: AdminActor;
  id: string;
  body: unknown;
  now?: Date;
}) {
  const current = await input.repository.findCampaign(input.id);
  if (current == null) {
    throw new DriverBenefitError(
      'DRIVER_BENEFIT_NOT_FOUND',
      'Campanha de Ranking & Benefícios não encontrada.',
    );
  }
  const instant = (input.now ?? new Date()).toISOString();
  const status = parseDriverBenefitStatus(input.body);
  const updated = await input.repository.updateCampaign({
    ...current,
    status,
    updatedAt: instant,
  });
  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'driver_benefits.campaign_status_changed',
    targetType: 'driver_benefit_campaign',
    targetId: updated.id,
    metadata: {
      previousStatus: current.status,
      status: updated.status,
    },
    createdAt: instant,
  });
  return updated;
}

export async function setDriverBenefitBase(input: {
  repository: DriverBenefitRepository;
  admin: AdminRepository;
  actor: AdminActor;
  driverId: string;
  body: unknown;
  now?: Date;
}) {
  const driverId = cleanText(
    input.driverId,
    'ID do motorista',
    1,
    120,
  );
  const base = parseDriverBenefitBase(input.body);
  const instant = (input.now ?? new Date()).toISOString();
  const previous = await input.repository.findDriverBase(driverId);
  const updated = await input.repository.setDriverBase({
    driverId,
    ...base,
    updatedAt: instant,
  });
  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'driver_benefits.driver_base_updated',
    targetType: 'driver',
    targetId: driverId,
    metadata: {
      previous,
      current: updated,
    },
    createdAt: instant,
  });
  return updated;
}

export async function clearDriverBenefitBase(input: {
  repository: DriverBenefitRepository;
  admin: AdminRepository;
  actor: AdminActor;
  driverId: string;
  now?: Date;
}) {
  const driverId = cleanText(
    input.driverId,
    'ID do motorista',
    1,
    120,
  );
  const previous = await input.repository.findDriverBase(driverId);
  const cleared = await input.repository.clearDriverBase(driverId);
  const instant = (input.now ?? new Date()).toISOString();
  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'driver_benefits.driver_base_cleared',
    targetType: 'driver',
    targetId: driverId,
    metadata: { previous, cleared },
    createdAt: instant,
  });
  return { driverId, cleared };
}
