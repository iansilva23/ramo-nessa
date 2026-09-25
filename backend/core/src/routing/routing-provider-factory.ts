import type { RoutingDistanceProvider } from './distance-provider.js';
import { GoogleRoutesProvider } from './google-routes-provider.js';
import { OsrmRoutingDistanceProvider } from './osrm-distance-provider.js';
import type { RoutingRouteProvider } from './route-provider.js';
import { ValhallaRoutingProvider } from './valhalla-route-provider.js';
import { resolveRoutingTimeoutMs } from '../config/runtime-config.js';

function routingProviderName(env: NodeJS.ProcessEnv): string {
  return env.ROUTING_PROVIDER?.trim().toLowerCase() || 'google';
}

export function createRoutingRouteProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RoutingRouteProvider | null {
  const provider = routingProviderName(env);
  const timeoutMs = resolveRoutingTimeoutMs(env);

  if (provider === 'google') {
    const apiKey = env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
    if (!apiKey) return null;
    return new GoogleRoutesProvider(
      apiKey,
      env.GOOGLE_ROUTES_BASE_URL?.trim() ||
        'https://routes.googleapis.com/',
      timeoutMs,
    );
  }

  if (provider === 'valhalla') {
    const baseUrl = env.ROUTING_BASE_URL?.trim();
    if (!baseUrl) return null;
    return new ValhallaRoutingProvider(baseUrl, timeoutMs);
  }

  if (provider === 'osrm') {
    return null;
  }

  throw new Error(
    'ROUTING_PROVIDER deve ser google, valhalla ou osrm.',
  );
}

export function createRoutingDistanceProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RoutingDistanceProvider | null {
  const provider = routingProviderName(env);
  const timeoutMs = resolveRoutingTimeoutMs(env);

  if (provider === 'google') {
    const apiKey = env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
    if (!apiKey) return null;
    return new GoogleRoutesProvider(
      apiKey,
      env.GOOGLE_ROUTES_BASE_URL?.trim() ||
        'https://routes.googleapis.com/',
      timeoutMs,
    );
  }

  if (provider === 'valhalla') {
    const baseUrl = env.ROUTING_BASE_URL?.trim();
    if (!baseUrl) return null;
    return new ValhallaRoutingProvider(baseUrl, timeoutMs);
  }

  if (provider === 'osrm') {
    const baseUrl = env.ROUTING_BASE_URL?.trim();
    if (!baseUrl) return null;
    return new OsrmRoutingDistanceProvider(baseUrl, timeoutMs);
  }

  throw new Error(
    'ROUTING_PROVIDER deve ser google, valhalla ou osrm.',
  );
}
