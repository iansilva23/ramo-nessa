import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RideRepository } from './ride-repository.js';

export const passengerRatingReasons = ['polite', 'punctual', 'respectful', 'communication', 'other'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function passengerRatingRoutes(input: {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  rides: RideRepository;
  authenticate: () => Promise<string>;
  readJson: (request: IncomingMessage) => Promise<unknown>;
  json: (response: ServerResponse, status: number, body: unknown) => void;
}): Promise<boolean> {
  const {request, response, url, rides, json} = input;
  const match = url.pathname.match(/^\/v1\/driver\/me\/rides\/([^/]+)\/passenger-rating$/);
  if (match == null) return false;
  const driverId = await input.authenticate();
  if (request.method !== 'GET' && request.method !== 'POST') {
    json(response, 405, {error: 'METHOD_NOT_ALLOWED'}); return true;
  }
  const rideId = match[1]!;
  const ride = uuid.test(rideId) ? await rides.findById(rideId) : null;
  if (ride == null || ride.driverId !== driverId) {
    json(response, 404, {error: 'RIDE_NOT_FOUND', message: 'Corrida não encontrada.'}); return true;
  }
  if (ride.state !== 'COMPLETED') {
    json(response, 409, {error: 'RATING_NOT_ALLOWED', message: 'A avaliação só fica disponível depois da corrida concluída.'}); return true;
  }
  const existing = await rides.findPassengerRating(rideId, driverId);
  if (request.method === 'GET') {
    json(response, 200, {rating: existing}); return true;
  }
  const raw = await input.readJson(request);
  const body = raw != null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const {stars} = body;
  const reasons = body.reasons === undefined ? [] : body.reasons;
  const comment = body.comment === undefined || body.comment === null ? null : body.comment;
  if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 5 ||
      !Array.isArray(reasons) || reasons.length > 5 ||
      !reasons.every(r => typeof r === 'string' && passengerRatingReasons.includes(r)) ||
      new Set(reasons).size !== reasons.length ||
      (comment !== null && (typeof comment !== 'string' || comment.length > 1000))) {
    json(response, 400, {error: 'INVALID_PASSENGER_RATING', message: 'Escolha de 1 a 5 estrelas e use um comentário de até 1000 caracteres.'}); return true;
  }
  const result = await rides.recordPassengerRating({rideId, driverId, passengerId: ride.passengerId,
    stars, reasons, comment: typeof comment === 'string' ? comment.trim() || null : null, createdAt: new Date().toISOString()});
  if (result == null) {
    json(response, 409, {error: 'RATING_NOT_ALLOWED', message: 'Não foi possível registrar a avaliação desta corrida.'}); return true;
  }
  // A retry after a lost response returns the original record, never a second rating.
  json(response, result.created ? 201 : 200, {rating: result.rating, duplicate: !result.created});
  return true;
}
