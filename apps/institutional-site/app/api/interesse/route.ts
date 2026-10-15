import { interestStore } from '@/db/interests';
import { allowInterestRequest, interestSchema, readInterestBody } from '@/lib/interest-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = new Set([process.env.PUBLIC_SITE_ORIGIN ?? 'https://ramonessa.com.br']);
  if (process.env.NODE_ENV !== 'production') allowed.add(new URL(request.url).origin);
  if (origin && !allowed.has(origin)) return reply({ error: 'Não foi possível validar a origem do envio.' }, 403);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply({ error: 'Formato de envio inválido.' }, 415);
  const address = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (!allowInterestRequest(address)) return reply({ error: 'Aguarde alguns minutos antes de tentar novamente.' }, 429);
  try {
    const result = interestSchema.safeParse(await readInterestBody(request));
    if (!result.success) return reply({ error: 'Confira o nome, o WhatsApp com DDD, a região, a categoria e a autorização de contato.' }, 400);
    const { name, phone, region, vehicle, requestId } = result.data;
    interestStore().save({ id: requestId, name, phone, region, vehicle });
    return reply({ status: 'registered' }, 201);
  } catch (error) {
    if (error instanceof RangeError) return reply({ error: 'Confira seus dados e tente novamente.' }, 413);
    console.error('Driver interest storage unavailable');
    return reply({ error: 'O envio está indisponível agora. Seus dados continuam no formulário. Tente novamente em instantes.' }, 503);
  }
}
