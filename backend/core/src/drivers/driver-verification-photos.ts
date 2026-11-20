import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Pool, PoolClient } from 'pg';
import type { AdminActor } from '../admin/admin-repository.js';
import type { LocalPrivateDocumentStorage } from './driver-document-private-storage.js';

const fields = {
  portrait: { side: 512, bytes: 256 * 1024 },
  vehicle_front: { side: 1280, bytes: 500 * 1024 },
  vehicle_rear: { side: 1280, bytes: 500 * 1024 },
  vehicle_left: { side: 1024, bytes: 300 * 1024 },
  vehicle_right: { side: 1024, bytes: 300 * 1024 },
} as const;
export type VerificationPhotoType = keyof typeof fields;

export function verificationPhotoType(value: string): VerificationPhotoType | null {
  return Object.hasOwn(fields, value) ? value as VerificationPhotoType : null;
}

export class VerificationPhotoError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export function verificationPhotoLimit(type: VerificationPhotoType): number {
  return fields[type].bytes;
}

async function normalizePhoto(type: VerificationPhotoType, bytes: Buffer) {
  const limit = fields[type];
  if (bytes.length === 0 || bytes.length > limit.bytes) {
    throw new VerificationPhotoError(413, 'PHOTO_SIZE', 'A foto excedeu o limite de envio.');
  }
  try {
    const source = sharp(bytes, {
      limitInputPixels: limit.side ** 2,
      failOn: 'warning',
      sequentialRead: true,
    });
    const metadata = await source.metadata();
    if ((metadata.format !== 'jpeg' && metadata.format !== 'webp') ||
        (metadata.pages ?? 1) !== 1 || metadata.width < 1 || metadata.height < 1 ||
        Math.max(metadata.width, metadata.height) > limit.side) throw new Error('invalid photo');
    // Decode pixels before accepting a photo. Re-encode without metadata.
    const { data, info } = await source.autoOrient().flatten({ background: '#fff' })
      .jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    if (data.length > limit.bytes) {
      throw new VerificationPhotoError(413, 'PHOTO_SIZE', 'A foto excedeu o limite de envio.');
    }
    return { data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof VerificationPhotoError) throw error;
    throw new VerificationPhotoError(422, 'PHOTO_INVALID', 'Não foi possível validar a imagem. Escolha outra foto.');
  }
}

type Vehicle = { id: string; photo_verification_revision: number };
type Photo = {
  id: string; photo_type: VerificationPhotoType; status: 'draft' | 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null; storage_key: string; content_sha256: string;
  driver_id: string; vehicle_id: string | null; vehicle_revision: number | null;
};
const currentPhotos = `driver_id = $1 AND is_current
  AND (vehicle_id IS NULL OR (vehicle_id = $2 AND vehicle_revision = $3))`;
function photoView(photo: Photo) {
  return {
    id: photo.id, type: photo.photo_type, status: photo.status, reason: photo.rejection_reason,
  };
}

export class DriverVerificationPhotos {
  private activeUploads = 0;
  private readonly uploads = new Map<string, { start: number; attempts: number; active: boolean }>();

  constructor(private readonly pool: Pool) {}

  async withUpload<T>(driverId: string, action: () => Promise<T>): Promise<T> {
    const now = Date.now();
    for (const [id, entry] of this.uploads) {
      if (!entry.active && now - entry.start >= 60_000) this.uploads.delete(id);
    }
    const entry = this.uploads.get(driverId) ?? { start: now, attempts: 0, active: false };
    if (entry.active || entry.attempts >= 12 || this.activeUploads >= 1 ||
        (!this.uploads.has(driverId) && this.uploads.size >= 2048)) {
      throw new VerificationPhotoError(429, 'PHOTO_BUSY', 'Aguarde antes de enviar outra foto.');
    }
    entry.active = true;
    entry.attempts++;
    this.uploads.set(driverId, entry);
    this.activeUploads++;
    try {
      return await action();
    } finally {
      entry.active = false;
      this.activeUploads--;
    }
  }

  private async vehicle(db: Pool | PoolClient, driverId: string, lock = false) {
    const result = await db.query<Vehicle>(`SELECT v.id, v.photo_verification_revision
      FROM driver_vehicles v JOIN driver_profiles p ON p.driver_id=v.driver_id
      WHERE v.driver_id=$1 AND v.status <> 'suspended' AND p.status <> 'suspended'
      ${lock ? 'FOR UPDATE OF p, v' : ''}`, [driverId]);
    const vehicle = result.rows[0];
    if (!vehicle) throw new VerificationPhotoError(409, 'PHOTO_VEHICLE', 'Cadastre um veículo ativo para enviar fotos.');
    return vehicle;
  }

  private async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async policy() {
    const { rows } = await this.pool.query<{ required: boolean }>(
      'SELECT required FROM driver_photo_policy ORDER BY revision DESC LIMIT 1');
    return { required: rows[0]?.required ?? false };
  }

  async setPolicy(required: boolean, actor: AdminActor) {
    await this.pool.query(`INSERT INTO driver_photo_policy (required,actor_kind,actor_id)
      VALUES ($1,$2,$3)`, [required,actor.kind,actor.id]);
    return { required };
  }

  async canReceiveNewWork(driverId: string) {
    const { rows } = await this.pool.query<{ allowed: boolean }>(`
      SELECT NOT COALESCE((SELECT required FROM driver_photo_policy ORDER BY revision DESC LIMIT 1), false)
        OR 5 = (SELECT count(DISTINCT f.photo_type) FROM driver_verification_photos f
          JOIN driver_vehicles v ON v.driver_id=f.driver_id
          WHERE f.driver_id=$1 AND f.status='approved'
            AND (f.vehicle_id IS NULL OR (f.vehicle_id=v.id AND f.vehicle_revision=v.photo_verification_revision))
        ) AS allowed`, [driverId]);
    return rows[0]?.allowed === true;
  }

  async status(driverId: string) {
    const vehicle = await this.vehicle(this.pool, driverId);
    const photos = await this.pool.query<Photo>(`SELECT * FROM driver_verification_photos
      WHERE ${currentPhotos}`, [driverId, vehicle.id, vehicle.photo_verification_revision]);
    return { vehicleId: vehicle.id, vehicleRevision: vehicle.photo_verification_revision,
      photos: photos.rows.map(photoView) };
  }

  private assertVehicle(vehicle: Vehicle, expected: string) {
    if (expected !== `${vehicle.id}:${vehicle.photo_verification_revision}`) {
      throw new VerificationPhotoError(409, 'PHOTO_VEHICLE_CHANGED', 'Os dados do veículo mudaram. Atualize a tela e confira as fotos.');
    }
  }

  async upload(driverId: string, type: VerificationPhotoType, expected: string, bytes: Buffer,
      storage: LocalPrivateDocumentStorage) {
    const encoded = await normalizePhoto(type, bytes);
    const hash = createHash('sha256').update(encoded.data).digest('hex');
    const id = randomUUID();
    const storageKey = `driver-verification/${id}/photo.jpg`;
    let written = false;
    try {
      return await this.transaction(async (client) => {
        const vehicle = await this.vehicle(client, driverId, true);
        this.assertVehicle(vehicle, expected);
        const params = [driverId, vehicle.id, vehicle.photo_verification_revision, type];
        const existing = (await client.query<Photo>(`SELECT * FROM driver_verification_photos
          WHERE ${currentPhotos} AND photo_type=$4`, params)).rows[0];
        if (existing?.content_sha256 === hash) return photoView(existing);
        if (existing?.status === 'pending') {
          throw new VerificationPhotoError(409, 'PHOTO_PENDING', 'Aguarde a análise desta foto.');
        }
        await storage.writeVerificationPhoto(storageKey, encoded.data);
        written = true;
        if (existing) await client.query('UPDATE driver_verification_photos SET is_current=false WHERE id=$1', [existing.id]);
        const row = (await client.query<Photo>(`INSERT INTO driver_verification_photos
          (id,driver_id,vehicle_id,vehicle_revision,photo_type,storage_key,content_sha256,mime_type,
           size_bytes,pixel_width,pixel_height,status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'image/jpeg',$8,$9,$10,'draft') RETURNING *`,
          [id,driverId,type === 'portrait' ? null : vehicle.id,
            type === 'portrait' ? null : vehicle.photo_verification_revision,
            type,storageKey,hash,encoded.data.length,encoded.width,encoded.height])).rows[0]!;
        return photoView(row);
      });
    } catch (error) {
      // On an ambiguous commit, preserve the object unless the database confirms it is unreferenced.
      if (written) {
        const record = await this.pool.query('SELECT 1 FROM driver_verification_photos WHERE id=$1', [id])
          .catch(() => null);
        if (record?.rowCount === 0) await storage.delete(storageKey).catch(() => undefined);
      }
      throw error;
    }
  }

  async submit(driverId: string, expected: string) {
    await this.transaction(async (client) => {
      const vehicle = await this.vehicle(client, driverId, true);
      this.assertVehicle(vehicle, expected);
      const params = [driverId, vehicle.id, vehicle.photo_verification_revision];
      const count = await client.query(`SELECT 1 FROM driver_verification_photos
        WHERE ${currentPhotos} AND status <> 'rejected'`, params);
      if (count.rowCount !== Object.keys(fields).length) {
        throw new VerificationPhotoError(409, 'PHOTO_INCOMPLETE', 'Complete as cinco fotos antes de enviar para análise.');
      }
      await client.query(`UPDATE driver_verification_photos SET status='pending',submitted_at=now()
        WHERE ${currentPhotos} AND status='draft'`, params);
    });
    return this.status(driverId);
  }

  async removeDraft(driverId: string, type: VerificationPhotoType, expected: string) {
    await this.transaction(async (client) => {
      const vehicle = await this.vehicle(client, driverId, true);
      this.assertVehicle(vehicle, expected);
      const params = [driverId, vehicle.id, vehicle.photo_verification_revision, type];
      const removed = await client.query(`UPDATE driver_verification_photos SET is_current=false
        WHERE ${currentPhotos} AND photo_type=$4 AND status='draft'`, params);
      if (removed.rowCount) {
        await client.query(`UPDATE driver_verification_photos SET is_current=true WHERE id=(
          SELECT id FROM driver_verification_photos WHERE driver_id=$1 AND photo_type=$4
            AND status='approved' AND (vehicle_id IS NULL OR (vehicle_id=$2 AND vehicle_revision=$3))
          ORDER BY reviewed_at DESC,id DESC LIMIT 1
        )`, params);
      }
    });
    return this.status(driverId);
  }

  async queue(offset: number, query: string) {
    const rows = await this.pool.query<Photo & { full_name: string; plate_normalized: string | null }>(`
      SELECT f.*, p.full_name, v.plate_normalized FROM driver_verification_photos f
      JOIN driver_profiles p USING (driver_id)
      LEFT JOIN driver_vehicles v ON v.driver_id=f.driver_id
      WHERE f.status='pending' AND f.is_current
        AND (f.vehicle_id IS NULL OR (f.vehicle_id=v.id AND f.vehicle_revision=v.photo_verification_revision))
        AND ($2='' OR strpos(lower(p.full_name),lower($2))>0 OR strpos(v.plate_normalized,upper($2))>0)
      ORDER BY f.submitted_at,f.id LIMIT 21 OFFSET $1`, [offset, query]);
    return { hasMore: rows.rows.length > 20, photos: rows.rows.slice(0, 20).map((row) => ({ ...photoView(row),
      driverId: row.driver_id, driverName: row.full_name, plate: row.plate_normalized })) };
  }

  async adminDriverPhotos(driverId: string) {
    const result = await this.pool.query<Photo>(`
      SELECT DISTINCT ON (f.photo_type) f.* FROM driver_verification_photos f
      LEFT JOIN driver_vehicles v ON v.driver_id=f.driver_id
      WHERE f.driver_id=$1 AND f.status <> 'draft' AND (f.is_current OR f.status='approved')
        AND (f.vehicle_id IS NULL OR (f.vehicle_id=v.id AND f.vehicle_revision=v.photo_verification_revision))
      ORDER BY f.photo_type, f.is_current DESC, f.submitted_at DESC, f.id DESC`, [driverId]);
    return { photos: result.rows.map(photoView) };
  }

  async adminImage(id: string, storage: LocalPrivateDocumentStorage, thumbnail: boolean) {
    const row = (await this.pool.query<Photo>(`SELECT * FROM driver_verification_photos
      WHERE id=$1 AND status <> 'draft'`, [id])).rows[0];
    if (!row) throw new VerificationPhotoError(404, 'PHOTO_NOT_FOUND', 'Foto indisponível.');
    const { bytes } = await storage.read(row.storage_key);
    if (bytes.length > fields[row.photo_type].bytes ||
        createHash('sha256').update(bytes).digest('hex') !== row.content_sha256) {
      throw new VerificationPhotoError(409, 'PHOTO_INTEGRITY', 'Não foi possível verificar a integridade da foto.');
    }
    return thumbnail ? sharp(bytes, { limitInputPixels: 1280 ** 2 })
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer() : bytes;
  }

  async review(id: string, actor: AdminActor, approved: boolean, reason: string | null) {
    return this.transaction(async (client) => {
      const photo = (await client.query<Photo>('SELECT * FROM driver_verification_photos WHERE id=$1', [id])).rows[0];
      if (!photo) throw new VerificationPhotoError(404, 'PHOTO_NOT_FOUND', 'Foto indisponível.');
      const vehicle = await this.vehicle(client, photo.driver_id, true);
      if (photo.vehicle_id != null && (photo.vehicle_id !== vehicle.id ||
          photo.vehicle_revision !== vehicle.photo_verification_revision)) {
        throw new VerificationPhotoError(409, 'PHOTO_VEHICLE_CHANGED', 'O veículo desta foto foi alterado.');
      }
      const row = (await client.query<Photo>(`UPDATE driver_verification_photos
        SET status=$2,reviewed_at=now(),reviewed_by_kind=$3,reviewed_by_id=$4,rejection_reason=$5
        WHERE id=$1 AND status='pending' AND is_current RETURNING *`,
        [id,approved?'approved':'rejected',actor.kind,actor.id,reason])).rows[0];
      if (!row) throw new VerificationPhotoError(409, 'PHOTO_REVIEWED', 'Esta foto já foi revisada ou substituída.');
      return photoView(row);
    });
  }
}
