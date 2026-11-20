import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdminActor } from '../admin/admin-repository.js';
import { readBinaryBody, readJsonBody } from '../http/request-body.js';
import type { LocalPrivateDocumentStorage } from './driver-document-private-storage.js';
import {
  type DriverVerificationPhotos, VerificationPhotoError, verificationPhotoLimit, verificationPhotoType,
} from './driver-verification-photos.js';

const driverPath = '/v1/driver/me/verification-photos';
const adminPath = '/v1/admin/driver-verification-photos';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function driverVerificationPhotoRoutes(input: {
  request: IncomingMessage; response: ServerResponse; url: URL;
  photos: DriverVerificationPhotos; storage: LocalPrivateDocumentStorage;
  driver: () => Promise<string>; admin: (write: boolean) => Promise<AdminActor>;
  openAccount: <T>(driverId: string, action: () => Promise<T>) => Promise<T>;
  json: (response: ServerResponse, status: number, payload: unknown) => void;
}): Promise<boolean> {
  const { request, response, url, photos, storage, json } = input;
  const method = request.method;
  const path = url.pathname;
  if (path !== driverPath && !path.startsWith(driverPath + '/') &&
      path !== adminPath && !path.startsWith(adminPath + '/')) return false;

  response.setHeader('Cache-Control', 'private, no-store');
  try {
    if (path === driverPath && method === 'GET') {
      json(response, 200, await photos.status(await input.driver()));
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
    if (path === adminPath + '/policy' && (method === 'GET' || method === 'PUT')) {
      const actor = await input.admin(method === 'PUT');
      if (method === 'GET') {
        json(response, 200, { ...await photos.policy(), disk: await storage.verificationCapacity().catch(() => null) });
        return true;
      }
      const body = await readJsonBody(request, 4096) as
        { startsAt?: unknown; deadlineAt?: unknown; reviewGraceHours?: unknown } | null;
      const parse = (value: unknown) => typeof value === 'string' && value.endsWith('Z')
        ? new Date(value) : null;
      const startsAt = parse(body?.startsAt);
      const deadlineAt = parse(body?.deadlineAt);
      const hours = body?.reviewGraceHours;
      const disabled = body?.startsAt === null && body.deadlineAt === null;
      if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 0 || hours > 720 ||
          (!disabled && !(startsAt && deadlineAt && startsAt < deadlineAt))) {
        throw new VerificationPhotoError(400, 'PHOTO_POLICY', 'Confira as datas e a tolerância de revisão.');
      }
      json(response, 200, await photos.setPolicy({ startsAt, deadlineAt, reviewGraceHours: hours }, actor));
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
    if (!submit && !(type && (method === 'PUT' || method === 'DELETE'))) return false;
    const driverId = await input.driver();
    const vehicle = url.searchParams.get('vehicle') ?? '';
    const payload = await photos.withUpload(driverId, async () => {
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
