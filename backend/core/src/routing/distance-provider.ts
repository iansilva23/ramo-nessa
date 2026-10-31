import type { GeoPoint } from '../matching/select-driver.js';

export class RoutingDistanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutingDistanceError';
  }
}

export interface RoutingDistanceProvider {
  routeEstimate?(input: {from: GeoPoint;to: GeoPoint}): Promise<{distanceKm:number;durationSeconds:number}>;
  routeDistanceKm(input: {
    from: GeoPoint;
    to: GeoPoint;
  }): Promise<number>;
}
