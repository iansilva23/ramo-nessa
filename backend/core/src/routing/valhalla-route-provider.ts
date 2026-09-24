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

interface ValhallaSummary {
  length?: number;
  time?: number;
}

interface ValhallaManeuver {
  instruction?: string;
  verbal_pre_transition_instruction?: string;
  type?: number;
  length?: number;
  time?: number;
  begin_shape_index?: number;
  end_shape_index?: number;
  street_names?: string[];
}

interface ValhallaLeg {
  shape?: string;
  maneuvers?: ValhallaManeuver[];
}

interface ValhallaResponse {
  trip?: {
    summary?: ValhallaSummary;
    legs?: ValhallaLeg[];
  };
  error?: string;
  error_code?: number;
  status_code?: number;
  status?: string;
}

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

function decodePolyline6(encoded: string): GeoPoint[] {
  const points: GeoPoint[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    const deltas: number[] = [];

    for (let coordinate = 0; coordinate < 2; coordinate += 1) {
      let result = 0;
      let shift = 0;
      let byte = 0;

      do {
        if (index >= encoded.length) {
          throw new RoutingRouteError(
            'INVALID_PROVIDER_RESPONSE',
            'Valhalla retornou uma geometria de rota inválida.',
          );
        }

        byte = encoded.charCodeAt(index) - 63;
        index += 1;
        result |= (byte & 0x1f) << shift;
        shift += 5;

        if (shift > 30) {
          throw new RoutingRouteError(
            'INVALID_PROVIDER_RESPONSE',
            'Valhalla retornou uma geometria de rota inválida.',
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
        'Valhalla retornou uma geometria de rota incompleta.',
      );
    }

    latitude += latDelta;
    longitude += lonDelta;
    points.push({
      latitude: latitude / 1e6,
      longitude: longitude / 1e6,
    });
  }

  return points;
}

function normalizedBaseUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('ROUTING_BASE_URL precisa ser uma URL válida.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('ROUTING_BASE_URL deve usar http ou https.');
  }

  if (!parsed.pathname.endsWith('/')) {
    parsed.pathname += '/';
  }
  return parsed;
}

export class ValhallaRoutingProvider
    implements RoutingRouteProvider, RoutingDistanceProvider {
  private readonly baseUrl: URL;

  constructor(
    baseUrl: string,
    private readonly timeoutMs = 5_000,
    private readonly fetcher: FetchLike = fetch,
  ) {
    this.baseUrl = normalizedBaseUrl(baseUrl);
  }

  async route(input: {
    from: GeoPoint;
    to: GeoPoint;
  }): Promise<RouteResult> {
    assertPoint(input.from);
    assertPoint(input.to);

    const url = new URL('route', this.baseUrl);
    let response: Response;

    try {
      response = await this.fetcher(url, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'user-agent': 'RamoNessaCore/0.1',
        },
        body: JSON.stringify({
          locations: [
            {
              lat: input.from.latitude,
              lon: input.from.longitude,
              type: 'break',
            },
            {
              lat: input.to.latitude,
              lon: input.to.longitude,
              type: 'break',
            },
          ],
          costing: 'auto',
          units: 'kilometers',
          directions_options: {
            units: 'kilometers',
            language: 'pt-BR',
          },
        }),
      });
    } catch {
      throw new RoutingRouteError(
        'PROVIDER_UNAVAILABLE',
        'O serviço de rotas não respondeu a tempo.',
      );
    }

    if (!response.ok) {
      throw new RoutingRouteError(
        response.status === 400 || response.status === 404
          ? 'ROUTE_NOT_FOUND'
          : 'PROVIDER_UNAVAILABLE',
        response.status === 400 || response.status === 404
          ? 'Não encontramos uma rota válida entre esses pontos.'
          : `O serviço de rotas respondeu HTTP ${response.status}.`,
      );
    }

    let payload: ValhallaResponse;
    try {
      payload = (await response.json()) as ValhallaResponse;
    } catch {
      throw new RoutingRouteError(
        'INVALID_PROVIDER_RESPONSE',
        'O serviço de rotas retornou uma resposta inválida.',
      );
    }

    const summary = payload.trip?.summary;
    const legs = payload.trip?.legs;
    if (
      summary == null ||
      typeof summary.length !== 'number' ||
      !Number.isFinite(summary.length) ||
      summary.length < 0 ||
      typeof summary.time !== 'number' ||
      !Number.isFinite(summary.time) ||
      summary.time < 0 ||
      !Array.isArray(legs) ||
      legs.length === 0
    ) {
      throw new RoutingRouteError(
        'ROUTE_NOT_FOUND',
        'Não encontramos uma rota válida entre esses pontos.',
      );
    }

    const points: GeoPoint[] = [];
    const maneuvers: RouteManeuver[] = [];
    let shapeOffset = 0;

    for (const leg of legs) {
      if (typeof leg.shape !== 'string' || leg.shape.length === 0) {
        throw new RoutingRouteError(
          'INVALID_PROVIDER_RESPONSE',
          'Valhalla retornou uma rota sem geometria.',
        );
      }

      const legPoints = decodePolyline6(leg.shape);
      if (legPoints.length < 2) {
        throw new RoutingRouteError(
          'INVALID_PROVIDER_RESPONSE',
          'Valhalla retornou poucos pontos para desenhar a rota.',
        );
      }

      const removeDuplicateStart =
        points.length > 0 &&
        points[points.length - 1]?.latitude === legPoints[0]?.latitude &&
        points[points.length - 1]?.longitude === legPoints[0]?.longitude;
      if (removeDuplicateStart) {
        points.push(...legPoints.slice(1));
      } else {
        points.push(...legPoints);
      }

      for (const maneuver of leg.maneuvers ?? []) {
        const lengthKm =
          typeof maneuver.length === 'number' &&
          Number.isFinite(maneuver.length) &&
          maneuver.length >= 0
            ? maneuver.length
            : 0;
        const timeSeconds =
          typeof maneuver.time === 'number' &&
          Number.isFinite(maneuver.time) &&
          maneuver.time >= 0
            ? Math.round(maneuver.time)
            : 0;

        maneuvers.push({
          instruction:
            maneuver.instruction?.trim() ||
            maneuver.verbal_pre_transition_instruction?.trim() ||
            'Continue pela rota indicada.',
          ...(maneuver.verbal_pre_transition_instruction?.trim()
            ? {
                verbalInstruction:
                  maneuver.verbal_pre_transition_instruction.trim(),
              }
            : {}),
          ...(typeof maneuver.type === 'number'
            ? { type: maneuver.type }
            : {}),
          distanceMeters: Math.round(lengthKm * 1000),
          durationSeconds: timeSeconds,
          ...(typeof maneuver.begin_shape_index === 'number'
            ? {
                beginShapeIndex:
                  shapeOffset + maneuver.begin_shape_index,
              }
            : {}),
          ...(typeof maneuver.end_shape_index === 'number'
            ? {
                endShapeIndex:
                  shapeOffset + maneuver.end_shape_index,
              }
            : {}),
          streetNames: Array.isArray(maneuver.street_names)
            ? maneuver.street_names
                .filter((value): value is string => typeof value === 'string')
                .map((value) => value.trim())
                .filter(Boolean)
            : [],
        });
      }

      shapeOffset += Math.max(0, legPoints.length - 1);
    }

    if (points.length < 2) {
      throw new RoutingRouteError(
        'INVALID_PROVIDER_RESPONSE',
        'Valhalla retornou poucos pontos para desenhar a rota.',
      );
    }

    return {
      points,
      distanceMeters: Math.round(summary.length * 1000),
      durationSeconds: Math.round(summary.time),
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

export function createValhallaRoutingProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ValhallaRoutingProvider | null {
  const baseUrl = env.ROUTING_BASE_URL?.trim();
  if (!baseUrl) return null;

  const provider = env.ROUTING_PROVIDER?.trim().toLowerCase() || 'valhalla';
  if (provider !== 'valhalla') return null;

  return new ValhallaRoutingProvider(
    baseUrl,
    resolveRoutingTimeoutMs(env),
  );
}
