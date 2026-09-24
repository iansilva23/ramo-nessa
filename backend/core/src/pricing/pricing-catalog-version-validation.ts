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

  throw new InvalidPricingCatalogPatchError(
    'kind deve ser fixed_route ou locality_price.',
  );
}
