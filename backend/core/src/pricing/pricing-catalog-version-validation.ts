import type { CommercialPolicy, SharedTransferSettings } from './catalog-snapshot.js';
import type { ServiceCategory } from './types.js';
export class InvalidPricingCatalogPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPricingCatalogPatchError';
  }
}

export type PricingCatalogAtomicPatch =
  | { kind: 'commercial_policy'; policy: CommercialPolicy }
  | { kind: 'shared_transfers'; settings: SharedTransferSettings }
  | {
      kind: 'fixed_route';
      routeId: string;
      dayCents: number;
      after22Cents: number;
    }
  | {
      kind: 'locality_price';
      hub: 'prea' | 'jijoca';
      localityId: string;
      category: 'moto' | 'delivery' | 'car' | 'buggy' | 'comfort_black';
      period?: 'day' | 'after_22';
      price:
        | { kind: 'exact'; amountCents: number }
        | { kind: 'range'; minCents: number; maxCents: number };
    }
  | {
      kind: 'locality_policy';
      hub: 'prea' | 'jijoca';
      localityId: string;
      enabledCategories: Array<
        'moto' | 'delivery' | 'car' | 'comfort_black' | 'buggy'
      >;
      applyNightSurcharge: boolean;
    }
  | {
      kind: 'distance_fare_policy';
      operation: 'upsert' | 'remove';
      anchorZoneId: 'jericoacoara' | 'jijoca' | 'prea' | 'external';
      anchorLocalityId: string;
      category: ServiceCategory;
      scope?: 'intra_zone';
      coveredLocalityIds?: string[];
      after22MinimumFareCents?: number;
      after22PricePerKmCents?: number;
      minKm?: number;
      maxKm?: number;
      minimumFareCents?: number;
      pricePerKmCents?: number;
    }
  | {
      kind: 'category_policy';
      category:
        | 'moto'
        | 'delivery'
        | 'car'
        | 'comfort_black'
        | 'buggy';
      enabled: boolean;
      requiresFourByFourOnJeriBoundary: boolean;
    }
  | {
      kind: 'zone_policy';
      zoneId: 'jericoacoara' | 'jijoca' | 'prea' | 'external';
      enabled: boolean;
    }
  | {
      kind: 'locality_label';
      scope: 'prea' | 'jijoca' | 'external';
      localityId: string;
      label: string;
    }
  | {
      kind: 'locality_structure';
      operation: 'add' | 'remove';
      scope: 'prea' | 'jijoca' | 'external';
      localityId: string;
    }
  | {
      kind: 'locality_geofence';
      operation: 'upsert';
      zoneId: 'jericoacoara' | 'jijoca' | 'prea' | 'external';
      localityId: string;
      centerLatitude: number;
      centerLongitude: number;
      radiusKm: number;
    }
  | {
      kind: 'locality_geofence';
      operation: 'remove';
      zoneId: 'jericoacoara' | 'jijoca' | 'prea' | 'external';
      localityId: string;
    }
  | {
      kind: 'commission_policy';
      commissionBps: number;
    }
  | {
      kind: 'period_policy';
      nightStartHour: number;
      dayStartHour: number;
    }
  | {
      kind: 'pickup_policy';
      freeKm: number;
      fuelPriceCentsPerLiter: number;
      motoReferenceKmPerLiter: number;
      carReferenceKmPerLiter: number;
    }
  | {
      kind: 'surcharge_policy';
      preaComfortCents: number;
      preaLocalCarAfter22Cents: number;
      preaLocalCarAfter22LocalityIds: string[];
    }
  | {
      kind: 'buggy_policy';
      minPassengers: number;
      maxPassengers: number;
      dayBaseCents: number;
      after22BaseCents: number;
      perPassengerCents: number;
    }
  | {
      kind: 'delivery_bands';
      bands: Array<{
        maxKm: number;
        amountCents: number;
      }>;
      aboveMaxCents: number;
    };

export type PricingCatalogDraftPatch =
  | PricingCatalogAtomicPatch
  | {
      kind: 'batch';
      patches: PricingCatalogAtomicPatch[];
    };

function objectValue(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidPricingCatalogPatchError(
      `${field} deve ser um objeto.`,
    );
  }
  return value as Record<string, unknown>;
}

function textValue(
  value: unknown,
  field: string,
  max = 120,
): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (
    !text ||
    text.length > max ||
    /[\u0000-\u001f\u007f]/.test(text)
  ) {
    throw new InvalidPricingCatalogPatchError(
      `${field} é inválido.`,
    );
  }
  return text;
}

function identifierValue(
  value: unknown,
  field: string,
): string {
  const text = textValue(value, field, 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text)) {
    throw new InvalidPricingCatalogPatchError(
      `${field} deve usar apenas letras minúsculas, números e hífens.`,
    );
  }
  return text;
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new InvalidPricingCatalogPatchError(
      `${field} deve ser booleano.`,
    );
  }
  return value;
}

function centsValue(value: unknown, field: string): number {
  const number = Number(value);
  if (
    !Number.isInteger(number) ||
    number <= 0 ||
    number > 10_000_000
  ) {
    throw new InvalidPricingCatalogPatchError(
      `${field} deve ser inteiro positivo em centavos.`,
    );
  }
  return number;
}

function nonNegativeCentsValue(
  value: unknown,
  field: string,
): number {
  const number = Number(value);
  if (
    !Number.isInteger(number) ||
    number < 0 ||
    number > 10_000_000
  ) {
    throw new InvalidPricingCatalogPatchError(
      `${field} deve ser inteiro não negativo em centavos.`,
    );
  }
  return number;
}

// Coordinates require finer precision than fare distances or radii. A
// three-decimal truncation could move a pin by tens of metres in Jeri/Preá.
function coordinateValue(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  const coordinate = Number(value);
  if (
    value == null ||
    typeof value === 'boolean' ||
    (typeof value === 'string' && value.trim() === '') ||
    !Number.isFinite(coordinate) ||
    coordinate < min ||
    coordinate > max
  ) {
    throw new InvalidPricingCatalogPatchError(
      `${field} deve ficar entre ${min} e ${max}.`,
    );
  }
  return Math.round(coordinate * 1000000) / 1000000;
}

function integerValue(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new InvalidPricingCatalogPatchError(
      `${field} deve ser inteiro entre ${min} e ${max}.`,
    );
  }
  return number;
}

function decimalValue(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new InvalidPricingCatalogPatchError(
      `${field} deve ficar entre ${min} e ${max}.`,
    );
  }
  return Math.round(number * 1000) / 1000;
}

function identifierListValue(
  value: unknown,
  field: string,
): string[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new InvalidPricingCatalogPatchError(
      `${field} deve ser uma lista com até 100 itens.`,
    );
  }
  const normalized = value.map((item, index) =>
    identifierValue(item, `${field}[${index}]`),
  );
  return [...new Set(normalized)];
}

export function parsePricingCatalogDraftPatch(
  input: unknown,
): PricingCatalogDraftPatch {
  const value = objectValue(input, 'body');
  const kind = textValue(value.kind, 'kind', 40);

  if (kind === 'batch') {
    if (!Array.isArray(value.patches) ||
        value.patches.length < 1 ||
        value.patches.length > 20) {
      throw new InvalidPricingCatalogPatchError(
        'Lote de localidade deve conter entre 1 e 20 alterações.',
      );
    }
    const allowed = new Set([
      'locality_structure',
      'locality_label',
      'locality_geofence',
      'locality_price',
      'locality_policy',
      'distance_fare_policy',
    ]);
    let owner: string | null = null;
    const patches: PricingCatalogAtomicPatch[] = value.patches.map(
      (candidate, index) => {
        const raw = objectValue(candidate, `patches[${index}]`);
        if (raw.kind === 'batch') {
          throw new InvalidPricingCatalogPatchError(
            'Lotes de alterações não podem ser aninhados.',
          );
        }
        const next = parsePricingCatalogDraftPatch(raw);
        if (next.kind === 'batch' || !allowed.has(next.kind)) {
          throw new InvalidPricingCatalogPatchError(
            'O lote aceita somente alterações da mesma localidade.',
          );
        }
        const patch = next as PricingCatalogAtomicPatch;
        const scope = 'scope' in patch
          ? patch.scope
          : 'hub' in patch
            ? patch.hub
            : 'zoneId' in patch
              ? patch.zoneId
              : 'anchorZoneId' in patch
                ? patch.anchorZoneId
                : null;
        const localityId = 'anchorLocalityId' in patch
          ? patch.anchorLocalityId
          : 'localityId' in patch
            ? patch.localityId
            : null;
        if (scope == null || localityId == null) {
          throw new InvalidPricingCatalogPatchError(
            'Alteração sem localidade não é permitida neste lote.',
          );
        }
        const key = `${scope}/${localityId}`;
        if (owner != null && owner !== key) {
          throw new InvalidPricingCatalogPatchError(
            'Todas as alterações do lote devem pertencer à mesma localidade.',
          );
        }
        owner = key;
        return patch;
      },
    );
    return { kind: 'batch', patches };
  }

  if (kind === 'commercial_policy') {
    const policy = objectValue(value.policy, 'policy');
    return {kind, policy: {
      revision: '2026-10-03',
      jijocaNightBps: integerValue(policy.jijocaNightBps,'jijocaNightBps',0,10000),
      jijocaComfortCents: nonNegativeCentsValue(policy.jijocaComfortCents,'jijocaComfortCents'),
      preaBuggyAfter22Cents: nonNegativeCentsValue(policy.preaBuggyAfter22Cents,'preaBuggyAfter22Cents'),
      buggyPerAdditionalPassengerCents: nonNegativeCentsValue(policy.buggyPerAdditionalPassengerCents,'buggyPerAdditionalPassengerCents'),
      deliveryBaseCents: centsValue(policy.deliveryBaseCents,'deliveryBaseCents'),
      deliveryIncludedKm: decimalValue(policy.deliveryIncludedKm,'deliveryIncludedKm',0,100),
      deliveryPerExcessKmCents: centsValue(policy.deliveryPerExcessKmCents,'deliveryPerExcessKmCents'),
      jeriTransferDestinationIds: identifierListValue(policy.jeriTransferDestinationIds,'jeriTransferDestinationIds'),
    }};
  }
  if (kind === 'shared_transfers') {
    const raw = objectValue(value.settings,'settings');
    const enabled = booleanValue(raw.enabled,'enabled');
    const whatsappPhone = typeof raw.whatsappPhone === 'string' ? raw.whatsappPhone.replace(/[ +().-]/g,'') : '';
    if ((enabled || whatsappPhone !== '') && !/^[1-9][0-9]{7,14}$/.test(whatsappPhone)) {
      throw new InvalidPricingCatalogPatchError('Informe o WhatsApp com código do país e DDD.');
    }
    if (!Array.isArray(raw.routes) || raw.routes.length > 50) throw new InvalidPricingCatalogPatchError('Rotas de compartilhado inválidas.');
    const routes = raw.routes.map((item,index)=>{
      const route = objectValue(item,`routes[${index}]`);
      const originId = identifierValue(route.originId,'originId');
      const destinationId = identifierValue(route.destinationId,'destinationId');
      if (originId === destinationId) throw new InvalidPricingCatalogPatchError('Origem e destino precisam ser diferentes.');
      return {originId,destinationId,enabled:booleanValue(route.enabled,'enabled')};
    });
    return {kind,settings:{enabled,whatsappPhone,
      buttonLabel:textValue(raw.buttonLabel,'buttonLabel',80),
      messageTemplate:textValue(raw.messageTemplate,'messageTemplate',500),routes}};
  }

  if (kind === 'fixed_route') {
    return {
      kind,
      routeId: textValue(value.routeId, 'routeId'),
      dayCents: centsValue(value.dayCents, 'dayCents'),
      after22Cents: centsValue(
        value.after22Cents,
        'after22Cents',
      ),
    };
  }

  if (kind === 'locality_price') {
    const hub = textValue(value.hub, 'hub', 20);
    if (hub !== 'prea' && hub !== 'jijoca') {
      throw new InvalidPricingCatalogPatchError(
        'hub deve ser prea ou jijoca.',
      );
    }

    const category = textValue(value.category, 'category', 30);
    if (
      category !== 'moto' &&
      category !== 'delivery' &&
      category !== 'car' && category !== 'buggy' &&
      category !== 'comfort_black'
    ) {
      throw new InvalidPricingCatalogPatchError(
        'category deve ser moto, delivery, car, buggy ou comfort_black.',
      );
    }

    const price = objectValue(value.price, 'price');
    const priceKind = textValue(price.kind, 'price.kind', 20);
    if (priceKind === 'exact') {
      return {
        kind,
        hub,
        localityId: textValue(
          value.localityId,
          'localityId',
        ),
        category,
        period: value.period === 'after_22' ? 'after_22' : 'day',
        price: {
          kind: 'exact',
          amountCents: centsValue(
            price.amountCents,
            'price.amountCents',
          ),
        },
      };
    }
    if (priceKind === 'range') {
      const minCents = centsValue(
        price.minCents,
        'price.minCents',
      );
      const maxCents = centsValue(
        price.maxCents,
        'price.maxCents',
      );
      if (minCents > maxCents) {
        throw new InvalidPricingCatalogPatchError(
          'price.minCents não pode ser maior que price.maxCents.',
        );
      }
      return {
        kind,
        hub,
        localityId: textValue(
          value.localityId,
          'localityId',
        ),
        category,
        period: value.period === 'after_22' ? 'after_22' : 'day',
        price: {
          kind: 'range',
          minCents,
          maxCents,
        },
      };
    }

    throw new InvalidPricingCatalogPatchError(
      'price.kind deve ser exact ou range.',
    );
  }

  if (kind === 'locality_policy') {
    const hub = textValue(value.hub, 'hub', 20);
    if (hub !== 'prea' && hub !== 'jijoca') {
      throw new InvalidPricingCatalogPatchError(
        'hub deve ser prea ou jijoca.',
      );
    }

    const localityId = identifierValue(
      value.localityId,
      'localityId',
    );
    if (!Array.isArray(value.enabledCategories)) {
      throw new InvalidPricingCatalogPatchError(
        'enabledCategories deve ser uma lista.',
      );
    }

    const enabledCategories = [
      ...new Set(
        value.enabledCategories.map((item, index) => {
          const category = textValue(
            item,
            `enabledCategories[${index}]`,
            30,
          );
          if (
            category !== 'moto' &&
            category !== 'delivery' &&
            category !== 'car' &&
            category !== 'comfort_black' && category !== 'buggy'
          ) {
            throw new InvalidPricingCatalogPatchError(
              'Categoria da localidade é inválida.',
            );
          }
          return category;
        }),
      ),
    ] as Array<
      'moto' | 'delivery' | 'car' | 'comfort_black' | 'buggy'
    >;

    const applyNightSurcharge = booleanValue(
      value.applyNightSurcharge,
      'applyNightSurcharge',
    );
    return {
      kind,
      hub,
      localityId,
      enabledCategories,
      applyNightSurcharge,
    };
  }

  if (kind === 'distance_fare_policy') {
    const operation = textValue(value.operation, 'operation', 20);
    if (operation !== 'upsert' && operation !== 'remove') {
      throw new InvalidPricingCatalogPatchError(
        'operation deve ser upsert ou remove.',
      );
    }

    const anchorZoneId = textValue(
      value.anchorZoneId,
      'anchorZoneId',
      30,
    );
    if (
      anchorZoneId !== 'jericoacoara' &&
      anchorZoneId !== 'jijoca' &&
      anchorZoneId !== 'prea' &&
      anchorZoneId !== 'external'
    ) {
      throw new InvalidPricingCatalogPatchError(
        'anchorZoneId é inválido.',
      );
    }

    const category = textValue(value.category, 'category', 30);
    const scope = value.scope == null ? 'anchor' : textValue(value.scope, 'scope', 20);
    if (scope !== 'anchor' && scope !== 'intra_zone') {
      throw new InvalidPricingCatalogPatchError('scope de distância inválido.');
    }
    if (!['moto', 'delivery', 'car', 'comfort_black'].includes(category) &&
        !(scope === 'intra_zone' && category === 'buggy')) {
      throw new InvalidPricingCatalogPatchError('category de cobrança por distância é inválida.');
    }
    const anchorLocalityId = identifierValue(value.anchorLocalityId, 'anchorLocalityId');
    if (scope === 'intra_zone' &&
        (!['prea', 'jijoca'].includes(anchorZoneId) ||
          anchorLocalityId !== anchorZoneId || category === 'delivery')) {
      throw new InvalidPricingCatalogPatchError(
        'Tarifa entre localidades é permitida apenas nas bases Preá/Jijoca e em transporte de passageiros.',
      );
    }
    const regional = scope === 'intra_zone'
      ? { scope: 'intra_zone' as const }
      : {};
    const base = {
      kind,
      operation,
      anchorZoneId,
      anchorLocalityId,
      category: category as ServiceCategory,
      ...regional,
    } as const;

    if (operation === 'remove') return base;

    const minKm = decimalValue(value.minKm, 'minKm', 0, 1000);
    const maxKm = decimalValue(value.maxKm, 'maxKm', 0.05, 2000);
    if (maxKm <= minKm) {
      throw new InvalidPricingCatalogPatchError(
        'maxKm deve ser maior que minKm.',
      );
    }

    const regionalDetails = scope === 'intra_zone'
      ? {
          coveredLocalityIds: identifierListValue(
            value.coveredLocalityIds, 'coveredLocalityIds',
          ),
          after22MinimumFareCents: centsValue(
            value.after22MinimumFareCents, 'after22MinimumFareCents',
          ),
          after22PricePerKmCents: centsValue(
            value.after22PricePerKmCents, 'after22PricePerKmCents',
          ),
        }
      : {};
    if (scope === 'intra_zone' &&
        (regionalDetails as {coveredLocalityIds: string[]}).coveredLocalityIds.length < 2) {
      throw new InvalidPricingCatalogPatchError(
        'Escolha pelo menos duas localidades aprovadas para a tarifa regional.',
      );
    }
    return {
      ...base,
      minKm,
      maxKm,
      minimumFareCents: centsValue(value.minimumFareCents, 'minimumFareCents'),
      pricePerKmCents: centsValue(value.pricePerKmCents, 'pricePerKmCents'),
      ...regionalDetails,
    };
  }

  if (kind === 'category_policy') {
    const category = textValue(value.category, 'category', 30);
    if (
      category !== 'moto' &&
      category !== 'delivery' &&
      category !== 'car' &&
      category !== 'comfort_black' &&
      category !== 'buggy'
    ) {
      throw new InvalidPricingCatalogPatchError(
        'category inválida.',
      );
    }

    return {
      kind,
      category,
      enabled: booleanValue(value.enabled, 'enabled'),
      requiresFourByFourOnJeriBoundary: booleanValue(
        value.requiresFourByFourOnJeriBoundary,
        'requiresFourByFourOnJeriBoundary',
      ),
    };
  }

  if (kind === 'zone_policy') {
    const zoneId = textValue(value.zoneId, 'zoneId', 30);
    if (
      zoneId !== 'jericoacoara' &&
      zoneId !== 'jijoca' &&
      zoneId !== 'prea' &&
      zoneId !== 'external'
    ) {
      throw new InvalidPricingCatalogPatchError(
        'zoneId inválida.',
      );
    }
    return {
      kind,
      zoneId,
      enabled: booleanValue(value.enabled, 'enabled'),
    };
  }

  if (kind === 'locality_label') {
    const scope = textValue(value.scope, 'scope', 20);
    if (scope !== 'prea' && scope !== 'jijoca' && scope !== 'external') {
      throw new InvalidPricingCatalogPatchError('scope da localidade é inválido.');
    }
    return {
      kind,
      scope,
      localityId: identifierValue(value.localityId, 'localityId'),
      label: textValue(value.label, 'label', 80),
    };
  }

  if (kind === 'locality_structure') {
    const operation = textValue(value.operation, 'operation', 20);
    if (operation !== 'add' && operation !== 'remove') {
      throw new InvalidPricingCatalogPatchError(
        'operation deve ser add ou remove.',
      );
    }

    const scope = textValue(value.scope, 'scope', 20);
    if (
      scope !== 'prea' &&
      scope !== 'jijoca' &&
      scope !== 'external'
    ) {
      throw new InvalidPricingCatalogPatchError(
        'scope deve ser prea, jijoca ou external.',
      );
    }

    return {
      kind,
      operation,
      scope,
      localityId: identifierValue(
        value.localityId,
        'localityId',
      ),
    };
  }

  if (kind === 'locality_geofence') {
    const operation = textValue(value.operation, 'operation', 20);
    if (operation !== 'upsert' && operation !== 'remove') {
      throw new InvalidPricingCatalogPatchError(
        'operation deve ser upsert ou remove.',
      );
    }

    const zoneId = textValue(value.zoneId, 'zoneId', 30);
    if (
      zoneId !== 'jericoacoara' &&
      zoneId !== 'jijoca' &&
      zoneId !== 'prea' &&
      zoneId !== 'external'
    ) {
      throw new InvalidPricingCatalogPatchError(
        'zoneId da geofence é inválida.',
      );
    }

    const localityId = identifierValue(
      value.localityId,
      'localityId',
    );
    if (operation === 'remove') {
      return {
        kind,
        operation,
        zoneId,
        localityId,
      };
    }

    return {
      kind,
      operation,
      zoneId,
      localityId,
      centerLatitude: coordinateValue(
        value.centerLatitude,
        'centerLatitude',
        -90,
        90,
      ),
      centerLongitude: coordinateValue(
        value.centerLongitude,
        'centerLongitude',
        -180,
        180,
      ),
      radiusKm: decimalValue(
        value.radiusKm,
        'radiusKm',
        0.05,
        100,
      ),
    };
  }

  if (kind === 'commission_policy') {
    return {
      kind,
      commissionBps: integerValue(
        value.commissionBps,
        'commissionBps',
        0,
        10_000,
      ),
    };
  }

  if (kind === 'period_policy') {
    const nightStartHour = integerValue(
      value.nightStartHour,
      'nightStartHour',
      0,
      23,
    );
    const dayStartHour = integerValue(
      value.dayStartHour,
      'dayStartHour',
      0,
      23,
    );
    if (nightStartHour === dayStartHour) {
      throw new InvalidPricingCatalogPatchError(
        'nightStartHour e dayStartHour devem ser diferentes.',
      );
    }
    return { kind, nightStartHour, dayStartHour };
  }

  if (kind === 'pickup_policy') {
    return {
      kind,
      freeKm: decimalValue(value.freeKm, 'freeKm', 0, 100),
      fuelPriceCentsPerLiter: centsValue(
        value.fuelPriceCentsPerLiter,
        'fuelPriceCentsPerLiter',
      ),
      motoReferenceKmPerLiter: decimalValue(
        value.motoReferenceKmPerLiter,
        'motoReferenceKmPerLiter',
        1,
        200,
      ),
      carReferenceKmPerLiter: decimalValue(
        value.carReferenceKmPerLiter,
        'carReferenceKmPerLiter',
        1,
        100,
      ),
    };
  }

  if (kind === 'surcharge_policy') {
    return {
      kind,
      preaComfortCents: nonNegativeCentsValue(
        value.preaComfortCents,
        'preaComfortCents',
      ),
      preaLocalCarAfter22Cents: nonNegativeCentsValue(
        value.preaLocalCarAfter22Cents,
        'preaLocalCarAfter22Cents',
      ),
      preaLocalCarAfter22LocalityIds: identifierListValue(
        value.preaLocalCarAfter22LocalityIds,
        'preaLocalCarAfter22LocalityIds',
      ),
    };
  }

  if (kind === 'buggy_policy') {
    const minPassengers = integerValue(
      value.minPassengers,
      'minPassengers',
      1,
      20,
    );
    const maxPassengers = integerValue(
      value.maxPassengers,
      'maxPassengers',
      1,
      20,
    );
    if (minPassengers > maxPassengers) {
      throw new InvalidPricingCatalogPatchError(
        'minPassengers não pode ser maior que maxPassengers.',
      );
    }
    return {
      kind,
      minPassengers,
      maxPassengers,
      dayBaseCents: centsValue(
        value.dayBaseCents,
        'dayBaseCents',
      ),
      after22BaseCents: centsValue(
        value.after22BaseCents,
        'after22BaseCents',
      ),
      perPassengerCents: nonNegativeCentsValue(
        value.perPassengerCents,
        'perPassengerCents',
      ),
    };
  }

  if (kind === 'delivery_bands') {
    if (
      !Array.isArray(value.bands) ||
      value.bands.length < 1 ||
      value.bands.length > 20
    ) {
      throw new InvalidPricingCatalogPatchError(
        'bands deve conter entre 1 e 20 faixas.',
      );
    }
    const bands = value.bands.map((item, index) => {
      const band = objectValue(item, `bands[${index}]`);
      return {
        maxKm: decimalValue(
          band.maxKm,
          `bands[${index}].maxKm`,
          0.1,
          100,
        ),
        amountCents: centsValue(
          band.amountCents,
          `bands[${index}].amountCents`,
        ),
      };
    });
    for (let index = 1; index < bands.length; index += 1) {
      if (bands[index]!.maxKm <= bands[index - 1]!.maxKm) {
        throw new InvalidPricingCatalogPatchError(
          'As faixas de entrega devem estar em ordem crescente e sem duplicidade.',
        );
      }
    }
    return {
      kind,
      bands,
      aboveMaxCents: centsValue(
        value.aboveMaxCents,
        'aboveMaxCents',
      ),
    };
  }

  throw new InvalidPricingCatalogPatchError(
    'kind de alteração do catálogo não é suportado.',
  );
}
