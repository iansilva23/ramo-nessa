import type { PricingCatalogSnapshot } from './catalog-snapshot.js';
import {
  PricingError,
  type LocationRef,
} from './types.js';

export function assertCatalogLocationSupported(input: {
  catalog: PricingCatalogSnapshot;
  ref: LocationRef;
  field: 'origin' | 'destination';
}): void {
  const { catalog, ref, field } = input;

  if (!catalog.zonePolicies[ref.zoneId].enabled) {
    throw new PricingError(
      'UNAVAILABLE_ZONE',
      `${field}.zoneId ${ref.zoneId} está desativada no catálogo vigente.`,
    );
  }

  const localityId = ref.localityId;
  if (ref.zoneId === 'external') {
    // Um ponto externo sem localityId representa uma coordenada livre.
    // Ele só será aceito de fato se alguma regra posterior conseguir
    // precificá-lo (por exemplo, fallback por distância de um ponto-base).
    if (localityId == null) return;

    if (!catalog.externalLocalities.includes(localityId)) {
      throw new PricingError(
        'UNKNOWN_LOCALITY',
        `${field}.localityId externo não pertence ao catálogo vigente.`,
      );
    }
    return;
  }

  if (localityId == null) return;

  if (
    ref.zoneId === 'prea' &&
    catalog.localities.prea[localityId] == null
  ) {
    throw new PricingError(
      'UNKNOWN_LOCALITY',
      `${field}.localityId não pertence à estrutura do Preá.`,
    );
  }

  if (
    ref.zoneId === 'jijoca' &&
    catalog.localities.jijoca[localityId] == null
  ) {
    throw new PricingError(
      'UNKNOWN_LOCALITY',
      `${field}.localityId não pertence à estrutura de Jijoca.`,
    );
  }

  if (
    ref.zoneId === 'jericoacoara' &&
    localityId !== 'jericoacoara'
  ) {
    throw new PricingError(
      'UNKNOWN_LOCALITY',
      `${field}.localityId não pertence à estrutura de Jericoacoara.`,
    );
  }
}
