import {
  RoutingDistanceError,
  type RoutingDistanceProvider,
} from './distance-provider.js';
import type { GeoPoint } from '../matching/select-driver.js';

interface OsrmResponse {
  code?: string;
  routes?: Array<{ distance?: number }>;
}

export class OsrmRoutingDistanceProvider
    implements RoutingDistanceProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
  ) {}

  async routeDistanceKm(input: {
    from: GeoPoint;
    to: GeoPoint;
  }): Promise<number> {
    const base = this.baseUrl.endsWith('/')
      ? this.baseUrl
      : `${this.baseUrl}/`;
    const coordinates =
      `${input.from.longitude},${input.from.latitude};` +
      `${input.to.longitude},${input.to.latitude}`;
    const url = new URL(
      `route/v1/driving/${coordinates}`,
      base,
    );
    url.searchParams.set('overview', 'false');
    url.searchParams.set('alternatives', 'false');
    url.searchParams.set('steps', 'false');

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: 'application/json',
          'user-agent': 'RamoNessaCore/0.1',
        },
      });
    } catch {
      throw new RoutingDistanceError(
        'Provedor de rotas não respondeu a tempo.',
      );
    }

    if (!response.ok) {
      throw new RoutingDistanceError(
        `Provedor de rotas respondeu HTTP ${response.status}.`,
      );
    }

    const payload = (await response.json()) as OsrmResponse;
    const meters = payload.routes?.[0]?.distance;
    if (
      payload.code !== 'Ok' ||
      typeof meters !== 'number' ||
      !Number.isFinite(meters) ||
      meters < 0
    ) {
      throw new RoutingDistanceError(
        'Provedor não retornou distância roteada válida.',
      );
    }

    return meters / 1000;
  }
}

export function createRoutingDistanceProviderFromEnv():
  | RoutingDistanceProvider
  | null {
  const baseUrl = process.env.ROUTING_BASE_URL?.trim();
  if (!baseUrl) return null;

  const timeoutMs = Number(process.env.ROUTING_TIMEOUT_MS ?? 5000);
  return new OsrmRoutingDistanceProvider(
    baseUrl,
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000,
  );
}
