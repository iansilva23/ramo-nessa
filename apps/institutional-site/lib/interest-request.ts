import { z } from 'zod';

export const interestSchema = z.object({
  name: z.string().trim().min(3).max(100),
  phone: z.string().max(20).transform(v => v.replace(/\D/g, '')).refine(v => /^(?:55)?[1-9]\d9\d{8}$/.test(v)),
  region: z.enum(['Jericoacoara', 'Preá', 'Jijoca', 'Interiores de Jijoca']),
  vehicle: z.enum(['Mototáxi', 'Carro', 'Comfort 4x4', 'Táxi Buggy', 'Entregas']),
  consent: z.literal(true),
  website: z.string().max(0),
  requestId: z.string().uuid(),
}).strict();

export async function readInterestBody(request: Request, limit = 4096) {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > limit) throw new RangeError('Body too large');
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RangeError('Body too large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

// A bounded, short-lived limit; no visitor addresses are written to disk or logs.
const attempts = new Map<string, { count: number; expires: number }>();
export function allowInterestRequest(key: string, now = Date.now()) {
  for (const [address, item] of attempts) if (item.expires <= now) attempts.delete(address);
  const current = attempts.get(key);
  if (current) {
    if (current.count >= 20) return false;
    current.count++;
    return true;
  }
  if (attempts.size >= 5000) return false;
  attempts.set(key, { count: 1, expires: now + 600_000 });
  return true;
}
