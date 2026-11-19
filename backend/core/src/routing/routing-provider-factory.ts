import type { RoutingDistanceProvider } from './distance-provider.js';
import { GoogleRoutesProvider } from './google-routes-provider.js';
import type { RoutingRouteProvider } from './route-provider.js';
import { resolveRoutingTimeoutMs } from '../config/runtime-config.js';

function googleProviderEnabled(
  env: NodeJS.ProcessEnv,
): boolean {
  const provider =
      env.ROUTING_PROVIDER?.trim().toLowerCase() || 'google';
  if (provider !== 'google') {
    throw new Error(
      'ROUTING_PROVIDER deve ser google.',
    );
  }
  return true;
}

function createGoogleProvider(
  env: NodeJS.ProcessEnv,
): GoogleRoutesProvider | null {
  googleProviderEnabled(env);
  const apiKey = env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
  if (!apiKey) return null;

  return new GoogleRoutesProvider(
    apiKey,
    env.GOOGLE_ROUTES_BASE_URL?.trim() ||
      'https://routes.googleapis.com/',
    resolveRoutingTimeoutMs(env),
  );
}

export function createRoutingRouteProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RoutingRouteProvider | null {
  return createGoogleProvider(env);
}

export function createRoutingDistanceProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RoutingDistanceProvider | null {
  return createGoogleProvider(env);
}
