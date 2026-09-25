import type { GeoPoint } from '../matching/select-driver.js';
import {
  RoutingDistanceError,
  type RoutingDistanceProvider,
} from './distance-provider.js';
import {
  RoutingRouteError,
  type RouteManeuver,
  type RouteResult,
  type RoutingRouteProvider,
} from './route-provider.js';
import { resolveRoutingTimeoutMs } from '../config/runtime-config.js';

type FetchLike = typeof fetch;

interface GoogleRoutesStep {
  distanceMeters?: number;
  staticDuration?: string;
  navigationInstruction?: {
    maneuver?: string;
    instructions?: string;
  };
}

interface GoogleRoutesLeg {
  steps?: GoogleRoutesStep[];
}

interface GoogleRoutesResponse {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    polyline?: {
      encodedPolyline?: string;
    };
    legs?: GoogleRoutesLeg[];
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

const GOOGLE_ROUTES_FIELD_MASK = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.encodedPolyline',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.navigationInstruction.instructions',
  'routes.legs.steps.navigationInstruction.maneuver',
].join(',');

function assertPoint(point: GeoPoint): void {
  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    point.latitude < -90 ||
    point.latitude > 90 ||
    point.longitude < -180 ||
    point.longitude > 180
  ) {
    throw new RoutingRouteError(
      'INVALID_COORDINATES',
      'Coordenadas inválidas para calcular a rota.',
    );
  }
}

function normalizeBaseUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('GOOGLE_ROUTES_BASE_URL precisa ser uma URL válida.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('GOOGLE_ROUTES_BASE_URL deve usar http ou https.');
  }
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
  return parsed;
}

function parseDurationSeconds(value: unknown): number {
  if (typeof value !== 'string' || !value.endsWith('s')) return 0;
  const seconds = Number.parseFloat(value.slice(0, -1));
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.round(seconds);
}

function decodeGooglePolyline(encoded: string): GeoPoint[] {
  const points: GeoPoint[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    const deltas: number[] = [];

    for (let coordinate = 0; coordinate < 2; coordinate += 1) {
      let result = 0;
      let shift = 0;
      let byte: number;

      do {
        if (index >= encoded.length) {
          throw new RoutingRouteError(
            'INVALID_PROVIDER_RESPONSE',
            'Google Routes retornou uma geometria de rota inválida.',
          );
        }

        byte = encoded.charCodeAt(index) - 63;
        index += 1;
        result |= (byte & 0x1f) << shift;
        shift += 5;

        if (shift > 30) {
          throw new RoutingRouteError(
            'INVALID_PROVIDER_RESPONSE',
            'Google Routes retornou uma geometria de rota inválida.',
          );
        }
      } while (byte >= 0x20);

      deltas.push((result & 1) !== 0 ? ~(result >> 1) : result >> 1);
    }

    const latDelta = deltas[0];
    const lonDelta = deltas[1];
    if (latDelta == null || lonDelta == null) {
      throw new RoutingRouteError(
        'INVALID_PROVIDER_RESPONSE',
        'Google Routes retornou uma geometria incompleta.',
      );
    }

    latitude += latDelta;
    longitude += lonDelta;

    points.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return points;
}

function googleManeuverType(value: string | undefined): number | undefined {
  switch (value) {
    case 'TURN_LEFT':
    case 'RAMP_LEFT':
    case 'FORK_LEFT':
    case 'TURN_SLIGHT_LEFT':
    case 'TURN_SHARP_LEFT':
      return 7;
    case 'TURN_RIGHT':
    case 'RAMP_RIGHT':
    case 'FORK_RIGHT':
    case 'TURN_SLIGHT_RIGHT':
    case 'TURN_SHARP_RIGHT':
      return 9;
    case 'UTURN_LEFT':
      return 15;
    case 'UTURN_RIGHT':
      return 17;
    case 'ROUNDABOUT_LEFT':
      return 26;
    case 'ROUNDABOUT_RIGHT':
      return 27;
    default:
      return undefined;
  }
}

export class GoogleRoutesProvider
    implements RoutingRouteProvider, RoutingDistanceProvider {
  private readonly baseUrl: URL;

  constructor(
    private readonly apiKey: string,
    baseUrl = 'https://routes.googleapis.com/',
    private readonly timeoutMs = 5_000,
    private readonly fetcher: FetchLike = fetch,
  ) {
    if (!apiKey.trim()) {
      throw new Error('GOOGLE_MAPS_SERVER_API_KEY é obrigatória.');
    }
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async route(input: {
    from: GeoPoint;
    to: GeoPoint;
  }): Promise<RouteResult> {
    assertPoint(input.from);
    assertPoint(input.to);

    const url = new URL('directions/v2:computeRoutes', this.baseUrl);
    let response: Response;

    try {
      response = await this.fetcher(url, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey,
          'x-goog-fieldmask': GOOGLE_ROUTES_FIELD_MASK,
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude: input.from.latitude,
                longitude: input.from.longitude,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: input.to.latitude,
                longitude: input.to.longitude,
              },
            },
          },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
          polylineQuality: 'HIGH_QUALITY',
          polylineEncoding: 'ENCODED_POLYLINE',
          languageCode: 'pt-BR',
          units: 'METRIC',
        }),
      });
    } catch {
      throw new RoutingRouteError(
        'PROVIDER_UNAVAILABLE',
        'O Google Routes não respondeu a tempo.',
      );
    }

    if (!response.ok) {
      let providerMessage = '';
      try {
        const body = (await response.json()) as GoogleRoutesResponse;
        providerMessage = body.error?.message?.trim() ?? '';
      } catch {
        // Mantém mensagem segura abaixo.
      }

      const notFound = response.status === 400 || response.status === 404;
      throw new RoutingRouteError(
        notFound ? 'ROUTE_NOT_FOUND' : 'PROVIDER_UNAVAILABLE',
        notFound
          ? 'Não encontramos uma rota válida entre esses pontos.'
          : providerMessage || `Google Routes respondeu HTTP ${response.status}.`,
      );
    }

    let payload: GoogleRoutesResponse;
    try {
      payload = (await response.json()) as GoogleRoutesResponse;
    } catch {
      throw new RoutingRouteError(
        'INVALID_PROVIDER_RESPONSE',
        'Google Routes retornou uma resposta inválida.',
      );
    }

    const route = payload.routes?.[0];
    const encodedPolyline = route?.polyline?.encodedPolyline;
    if (
      route == null ||
      typeof route.distanceMeters !== 'number' ||
      !Number.isFinite(route.distanceMeters) ||
      route.distanceMeters < 0 ||
      typeof route.duration !== 'string' ||
      typeof encodedPolyline !== 'string' ||
      encodedPolyline.length === 0
    ) {
      throw new RoutingRouteError(
        'ROUTE_NOT_FOUND',
        'Não encontramos uma rota válida entre esses pontos.',
      );
    }

    const points = decodeGooglePolyline(encodedPolyline);
    if (points.length < 2) {
      throw new RoutingRouteError(
        'INVALID_PROVIDER_RESPONSE',
        'Google Routes retornou poucos pontos para desenhar a rota.',
      );
    }

    const maneuvers: RouteManeuver[] = [];
    for (const leg of route.legs ?? []) {
      for (const step of leg.steps ?? []) {
        const distanceMeters =
          typeof step.distanceMeters === 'number' &&
          Number.isFinite(step.distanceMeters) &&
          step.distanceMeters >= 0
            ? Math.round(step.distanceMeters)
            : 0;
        const instruction =
          step.navigationInstruction?.instructions?.trim() ||
          'Continue pela rota indicada.';
        const mappedType = googleManeuverType(
          step.navigationInstruction?.maneuver,
        );

        maneuvers.push({
          instruction,
          verbalInstruction: instruction,
          ...(mappedType == null ? {} : { type: mappedType }),
          distanceMeters,
          durationSeconds: parseDurationSeconds(step.staticDuration),
          streetNames: [],
        });
      }
    }

    return {
      points,
      distanceMeters: Math.round(route.distanceMeters),
      durationSeconds: parseDurationSeconds(route.duration),
      maneuvers,
    };
  }

  async routeDistanceKm(input: {
    from: GeoPoint;
    to: GeoPoint;
  }): Promise<number> {
    try {
      const route = await this.route(input);
      return route.distanceMeters / 1000;
    } catch (error) {
      if (error instanceof RoutingRouteError) {
        throw new RoutingDistanceError(error.message);
      }
      throw error;
    }
  }
}

export function createGoogleRoutesProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GoogleRoutesProvider | null {
  const apiKey = env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
  if (!apiKey) return null;

  return new GoogleRoutesProvider(
    apiKey,
    env.GOOGLE_ROUTES_BASE_URL?.trim() ||
      'https://routes.googleapis.com/',
    resolveRoutingTimeoutMs(env),
  );
}
