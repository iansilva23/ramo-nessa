import {
  RoutingDistanceError,
  type RoutingDistanceProvider,
} from './distance-provider.js';
import type { GeoPoint } from '../matching/select-driver.js';
import { resolveRoutingTimeoutMs } from '../config/runtime-config.js';
import { ValhallaRoutingProvider } from './valhalla-route-provider.js';

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

    let payload: OsrmResponse;
    try {
      payload = (await response.json()) as OsrmResponse;
    } catch {
      throw new RoutingDistanceError(
        'Provedor de rotas retornou uma resposta inválida.',
      );
    }

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

export function createRoutingDistanceProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RoutingDistanceProvider | null {
  const baseUrl = env.ROUTING_BASE_URL?.trim();
  if (!baseUrl) return null;

  const provider = env.ROUTING_PROVIDER?.trim().toLowerCase() || 'valhalla';
  const timeoutMs = resolveRoutingTimeoutMs(env);

  if (provider === 'valhalla') {
    return new ValhallaRoutingProvider(baseUrl, timeoutMs);
  }

  if (provider === 'osrm') {
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error('ROUTING_BASE_URL precisa ser uma URL válida.');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('ROUTING_BASE_URL deve usar http ou https.');
    }

    return new OsrmRoutingDistanceProvider(
      parsed.toString(),
      timeoutMs,
    );
  }

  throw new Error(
    'ROUTING_PROVIDER deve ser valhalla ou osrm.',
  );
}
