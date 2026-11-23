import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RideRepository } from '../rides/ride-repository.js';
import type { AdminActor } from '../admin/admin-repository.js';
import { readBinaryBody, readJsonBody } from '../http/request-body.js';
import type { LocalPrivateDocumentStorage } from './driver-document-private-storage.js';
import {
  type DriverVerificationPhotos, VerificationPhotoError, verificationPhotoLimit, verificationPhotoType,
} from './driver-verification-photos.js';

const driverPath = '/v1/driver/me/verification-photos';
const adminPath = '/v1/admin/driver-verification-photos';
const visibleRideStates = new Set(['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function driverVerificationPhotoRoutes(input: {
  request: IncomingMessage; response: ServerResponse; url: URL;
  photos: DriverVerificationPhotos; storage: LocalPrivateDocumentStorage;
  passenger?: () => Promise<string>;
  rides?: Pick<RideRepository, 'findById'>;
  driver: () => Promise<string>; admin: (write: boolean) => Promise<AdminActor>;
  openAccount: <T>(driverId: string, action: () => Promise<T>) => Promise<T>;
  json: (response: ServerResponse, status: number, payload: unknown) => void;
}): Promise<boolean> {
  const { request, response, url, photos, storage, json } = input;
  const method = request.method;
  const path = url.pathname;
  const directUpload = path === '/v1/driver/me/photo' && method === 'PUT';
  const ridePortrait = method === 'GET' ? path.match(/^\/v1\/rides\/([0-9a-f-]{36})\/driver-portrait$/) : null;
  if (!directUpload && !ridePortrait && path !== driverPath && !path.startsWith(driverPath + '/') &&
      path !== adminPath && !path.startsWith(adminPath + '/')) return false;

  async function sendApprovedPortrait(driverId: string) {
    const bytes = await photos.approvedPortrait(driverId, storage);
    if (bytes == null) throw new VerificationPhotoError(404, 'PHOTO_NOT_FOUND', 'Foto indisponível.');
    response.setHeader('Content-Type', 'image/jpeg');
    response.setHeader('Content-Length', bytes.length);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(bytes);
  }

  response.setHeader('Cache-Control', 'private, no-store');
  try {
    if (directUpload) {
      await input.driver();
      json(response, 409, { error: 'PHOTO_REVIEW_REQUIRED',
        message: 'Envie uma nova foto do rosto em Fotos do cadastro para análise.' });
      return true;
    }
    if (path === driverPath && method === 'GET') {
      json(response, 200, await photos.status(await input.driver()));
      return true;
    }
    if (ridePortrait) {
      if (!input.passenger || !input.rides) return false;
      const passengerId = await input.passenger();
      const ride = await input.rides.findById(ridePortrait[1]!);
      const driverId = url.searchParams.get('driver');
      if (!ride || ride.passengerId !== passengerId || !ride.driverId ||
          ride.driverId !== driverId ||
          !(visibleRideStates.has(ride.state) ||
            (ride.state === 'AWAITING_PAYMENT' && ride.driverConsentRequired === true &&
             ride.reservedDriverId === driverId && Date.parse(ride.driverHoldExpiresAt ?? '') > Date.now()))) {
        throw new VerificationPhotoError(404, 'PHOTO_NOT_FOUND', 'Foto indisponível.');
      }
      await sendApprovedPortrait(ride.driverId);
      return true;
    }
    if (path === driverPath + '/avatar' && method === 'GET') {
      await sendApprovedPortrait(await input.driver());
      return true;
    }
    if (path === adminPath && method === 'GET') {
      await input.admin(false);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const query = (url.searchParams.get('q') ?? '').trim();
      if (!Number.isInteger(offset) || offset < 0 || offset > 20000 || query.length > 80) {
        throw new VerificationPhotoError(400, 'PHOTO_SEARCH', 'Busca inválida.');
      }
      json(response, 200, await photos.queue(offset, query));
      return true;
    }
    const driverDetails = path.match(/^\/v1\/admin\/driver-verification-photos\/driver\/([a-zA-Z0-9._:-]{1,120})$/);
    if (driverDetails && method === 'GET') {
      await input.admin(false);
      json(response, 200, await photos.adminDriverPhotos(driverDetails[1]!));
      return true;
    }
    if (path === adminPath + '/policy' && (method === 'GET' || method === 'PUT')) {
      const actor = await input.admin(method === 'PUT');
      if (method === 'GET') {
        json(response, 200, { ...await photos.policy(), disk: await storage.verificationCapacity().catch(() => null) });
        return true;
      }
      const body = await readJsonBody(request, 4096) as { required?: unknown } | null;
      if (typeof body?.required !== 'boolean') {
        throw new VerificationPhotoError(400, 'PHOTO_POLICY', 'Informe se a verificação é obrigatória.');
      }
      json(response, 200, await photos.setPolicy(body.required, actor));
      return true;
    }
    if (path.startsWith(adminPath + '/')) {
      const [id, action, extra] = path.slice(adminPath.length + 1).split('/');
      if (!id || !uuid.test(id) || extra !== undefined) return false;
      if ((action === 'image' || action === 'thumbnail') && method === 'GET') {
        await input.admin(false);
        const bytes = await photos.adminImage(id, storage, action === 'thumbnail');
        response.setHeader('Content-Type', 'image/jpeg');
        response.setHeader('Content-Length', bytes.length);
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.end(bytes);
        return true;
      }
      if (action === 'review' && method === 'PATCH') {
        const actor = await input.admin(true);
        const body = await readJsonBody(request, 4096) as { decision?: unknown; reason?: unknown } | null;
        const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
        if (body?.decision !== 'approved' && (body?.decision !== 'rejected' || !reason || reason.length > 1000)) {
          throw new VerificationPhotoError(400, 'PHOTO_REVIEW', 'Selecione a decisão e informe o motivo da reprovação.');
        }
        const approved = body.decision === 'approved';
        json(response, 200, await photos.review(id, actor, approved, approved ? null : reason));
        return true;
      }
      return false;
    }

    const type = verificationPhotoType(path.slice(driverPath.length + 1));
    const submit = path === driverPath + '/submit' && method === 'POST';
    const replacePortrait = path === driverPath + '/avatar/submit' && method === 'POST';
    if (!submit && !replacePortrait && !(type && (method === 'PUT' || method === 'DELETE'))) return false;
    const driverId = await input.driver();
    const vehicle = url.searchParams.get('vehicle') ?? '';
    const payload = await photos.withUpload(driverId, async () => {
      if (replacePortrait) {
        return input.openAccount(driverId, () => photos.submitPortraitReplacement(driverId, vehicle));
      }
      if (submit) return input.openAccount(driverId, () => photos.submit(driverId, vehicle));
      if (!type) throw new Error('Missing photo type.');
      if (method === 'DELETE') return input.openAccount(driverId, () => photos.removeDraft(driverId, type, vehicle));
      const mime = request.headers['content-type'];
      if (mime !== 'image/jpeg' && mime !== 'image/webp') {
        throw new VerificationPhotoError(415, 'PHOTO_FORMAT', 'Envie a foto otimizada em JPEG ou WebP.');
      }
      const bytes = await readBinaryBody(request, verificationPhotoLimit(type));
      if ((mime === 'image/jpeg' && (bytes[0] !== 0xff || bytes[1] !== 0xd8)) ||
          (mime === 'image/webp' && (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP'))) {
        throw new VerificationPhotoError(422, 'PHOTO_INVALID', 'O arquivo não corresponde ao formato informado.');
      }
      return input.openAccount(driverId, () => photos.upload(driverId, type, vehicle, bytes, storage));
    });
    json(response, method === 'PUT' ? 201 : 200, payload);
    return true;
  } catch (error) {
    if (!(error instanceof VerificationPhotoError)) throw error;
    json(response, error.status, { error: error.code, message: error.message });
    return true;
  }
}
