import type { GeoPoint } from '../matching/select-driver.js';

export interface RouteManeuver {
  instruction: string;
  verbalInstruction?: string;
  type?: number;
  distanceMeters: number;
  durationSeconds: number;
  beginShapeIndex?: number;
  endShapeIndex?: number;
  streetNames: string[];
}

export interface RouteResult {
  points: GeoPoint[];
  distanceMeters: number;
  durationSeconds: number;
  maneuvers: RouteManeuver[];
}

export class RoutingRouteError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_COORDINATES'
      | 'PROVIDER_UNAVAILABLE'
      | 'ROUTE_NOT_FOUND'
      | 'INVALID_PROVIDER_RESPONSE',
    message: string,
  ) {
    super(message);
    this.name = 'RoutingRouteError';
  }
}

export interface RoutingRouteProvider {
  route(input: {
    from: GeoPoint;
    to: GeoPoint;
  }): Promise<RouteResult>;
}
