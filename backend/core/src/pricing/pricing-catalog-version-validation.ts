export class InvalidPricingCatalogPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPricingCatalogPatchError';
  }
}

export type PricingCatalogDraftPatch =
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
      category: 'moto' | 'delivery' | 'car';
      price:
        | { kind: 'exact'; amountCents: number }
        | { kind: 'range'; minCents: number; maxCents: number };
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
      kind: 'locality_structure';
      operation: 'add' | 'remove';
      scope: 'prea' | 'jijoca' | 'external';
      localityId: string;
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

export function parsePricingCatalogDraftPatch(
  input: unknown,
): PricingCatalogDraftPatch {
  const value = objectValue(input, 'body');
  const kind = textValue(value.kind, 'kind', 40);

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
      category !== 'car'
    ) {
      throw new InvalidPricingCatalogPatchError(
        'category deve ser moto, delivery ou car.',
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

  throw new InvalidPricingCatalogPatchError(
    'kind de alteração do catálogo não é suportado.',
  );
}
