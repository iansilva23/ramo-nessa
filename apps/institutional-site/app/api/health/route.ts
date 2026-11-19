import { interestStore } from '@/db/interests';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() {
  try {
    interestStore().check();
    return Response.json({ ok: true, service: 'ramo-nessa-site' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, service: 'ramo-nessa-site' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
