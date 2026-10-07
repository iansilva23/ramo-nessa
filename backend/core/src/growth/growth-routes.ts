import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdminActor, AdminScope } from '../admin/admin-repository.js';
import {
  campaignInput,
  preferenceInput,
  settingsInput,
  object,
  textValue,
  GrowthError,
} from './growth-model.js';
import type { GrowthService } from './growth-service.js';

export async function handleGrowthRoutes(input: {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  service: GrowthService;
  authorize(scope: AdminScope): Promise<AdminActor>;
  passenger(): Promise<string>;
  readJson(): Promise<unknown>;
  json(status: number, payload: unknown): void;
  verifyOptout(token: string): {
    id: string;
    ch: 'inapp' | 'push' | 'email' | 'whatsapp';
  };
}): Promise<boolean> {
  const { request, response, url, service } = input,
    store = service.deps.store,
    path = url.pathname,
    method = request.method;
  if (
    !path.startsWith('/v1/admin/issues') &&
    !path.startsWith('/v1/admin/marketing') &&
    !path.startsWith('/v1/passenger/me/marketing') &&
    path !== '/v1/marketing/unsubscribe'
  )
    return false;
  try {
    if (
      path === '/v1/marketing/unsubscribe' &&
      (method === 'GET' || method === 'POST')
    ) {
      const value = url.searchParams.get('token') ?? '',
        target = input.verifyOptout(value);
      if (method === 'GET') {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          'content-security-policy':
            "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
        });
        response.end(
          `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Preferências Ramo Nessa</title><h1>Parar de receber promoções</h1><p>Confirme para desativar promoções neste canal. Avisos de corridas continuam disponíveis.</p><form method="post" action="?token=${encodeURIComponent(value)}"><button>Desativar promoções</button></form></html>`,
        );
      } else {
        request.resume();
        const preference = await store.preference(target.id);
        preference.channels[target.ch] = false;
        preference.updatedAt = new Date().toISOString();
        await store.savePreference(preference);
        input.json(200, { message: 'Promoções desativadas neste canal.' });
      }
      return true;
    }
    if (path === '/v1/admin/issues' && method === 'GET') {
      await input.authorize('issues:read');
      input.json(200, await service.issues());
      return true;
    }
    if (path === '/v1/admin/issues/review' && method === 'POST') {
      const actor = await input.authorize('issues:write'),
        b = object(await input.readJson()),
        key = textValue(b.key, 180, 'Problema', 1);
      const issue = (await service.issues()).items.find((i) => i.key === key);
      if (!issue)
        throw new GrowthError(
          404,
          'Problema não está mais detectado. Atualize o painel.',
        );
      if (!['new', 'in_progress', 'resolved'].includes(String(b.status)))
        throw new GrowthError(400, 'Situação inválida.');
      await store.saveReview(
        {
          key,
          status: b.status as 'new' | 'in_progress' | 'resolved',
          owner: textValue(b.owner ?? '', 80, 'Responsável'),
          notes: textValue(b.notes ?? '', 500, 'Observação'),
          updatedAt: new Date().toISOString(),
          issue: {
            key: issue.key,
            severity: issue.severity,
            title: issue.title,
            evidence: issue.evidence,
            causes: issue.causes,
            actions: issue.actions,
            source: issue.source,
            sourceId: issue.sourceId,
            zone: issue.zone,
            category: issue.category,
            at: issue.at,
          },
        },
        actor,
      );
      input.json(200, { saved: true });
      return true;
    }
    if (path === '/v1/admin/marketing' && method === 'GET') {
      await input.authorize('marketing:read');
      input.json(200, await service.view());
      return true;
    }
    if (path === '/v1/admin/marketing/settings' && method === 'PUT') {
      const actor = await input.authorize('marketing:write'),
        b = object(await input.readJson()),
        s = settingsInput(b.settings);
      if (s.enabled) await input.authorize('marketing:send');
      const old = await store.settings();
      s.updatedAt = new Date(
        Math.max(Date.now(), Date.parse(old.updatedAt) + 1),
      ).toISOString();
      await store.saveSettings(
        s,
        textValue(b.expectedUpdatedAt, 40, 'Versão'),
        actor,
      );
      input.json(200, { settings: s });
      return true;
    }
    const match = path.match(
      /^\/v1\/admin\/marketing\/campaigns(?:\/([0-9a-f-]{36})(?:\/(preview|execute|report))?)?$/i,
    );
    if (match) {
      const id = match[1],
        action = match[2];
      if (id && action === 'preview' && method === 'GET') {
        await input.authorize('marketing:read');
        input.json(200, (await service.preview(id)).public);
        return true;
      }
      if (id && action === 'report' && method === 'GET') {
        await input.authorize('marketing:read');
        input.json(200, await service.report(id));
        return true;
      }
      if (id && action === 'execute' && method === 'POST') {
        const actor = await input.authorize('marketing:send');
        input.json(200, await service.execute(id, actor));
        return true;
      }
      if (!action && ((!id && method === 'POST') || (id && method === 'PUT'))) {
        const actor = await input.authorize('marketing:write'),
          b = object(await input.readJson()),
          old = id
            ? (await store.campaigns()).find((c) => c.id === id)
            : undefined;
        if (id && !old) throw new GrowthError(404, 'Campanha não encontrada.');
        const c = campaignInput(b.campaign, old);
        if (c.enabled) await input.authorize('marketing:send');
        if (c.couponValueCents > 0) await input.authorize('finance:write');
        if (old)
          c.updatedAt = new Date(
            Math.max(Date.now(), Date.parse(old.updatedAt) + 1),
          ).toISOString();
        await store.saveCampaign(
          c,
          old ? textValue(b.expectedUpdatedAt, 40, 'Versão') : null,
          actor,
        );
        input.json(old ? 200 : 201, { campaign: c });
        return true;
      }
    }
    if (path === '/v1/passenger/me/marketing' && method === 'GET') {
      const id = await input.passenger();
      input.json(200, await service.passengerView(id));
      return true;
    }
    if (path === '/v1/passenger/me/marketing/preferences' && method === 'PUT') {
      const id = await input.passenger(),
        p = preferenceInput(id, await input.readJson());
      await store.savePreference(p);
      await service.deps.privacy.savePreferences({
        subjectType: 'passenger',
        subjectId: id,
        marketingNotificationsEnabled: Object.values(p.channels).some(Boolean),
        updatedAt: p.updatedAt,
      });
      input.json(200, { preference: p });
      return true;
    }
    const opened = path.match(
      /^\/v1\/passenger\/me\/marketing\/messages\/([0-9a-f-]{36})\/opened$/i,
    );
    if (opened && method === 'POST') {
      const id = await input.passenger();
      await store.markOpened(opened[1]!, id, new Date().toISOString());
      input.json(200, { saved: true });
      return true;
    }
    if (path === '/v1/passenger/me/marketing/referral' && method === 'GET') {
      const id = await input.passenger();
      input.json(200, {
        code: `RN${createHash('sha256').update(id).digest('hex').slice(0, 16).toUpperCase()}`,
      });
      return true;
    }
    if (path === '/v1/passenger/me/marketing/referral' && method === 'POST') {
      const id = await input.passenger(),
        b = object(await input.readJson()),
        code = textValue(b.code, 18, 'Código', 18).toUpperCase();
      const snapshot = await service.customers();
      if (!snapshot.complete)
        throw new GrowthError(422, 'Indicação indisponível neste momento.');
      const referrer = snapshot.customers.find(
        (u) =>
          `RN${createHash('sha256').update(u.identity.subjectId).digest('hex').slice(0, 16).toUpperCase()}` ===
          code,
      );
      const me = snapshot.customers.find((u) => u.identity.subjectId === id);
      if (
        !me ||
        me.completed > 0 ||
        !referrer ||
        referrer.identity.subjectId === id ||
        referrer.identity.phoneE164 === me.identity.phoneE164
      )
        throw new GrowthError(
          400,
          'Indicação inválida ou primeira corrida já realizada.',
        );
      await store.saveReferral({
        code,
        referrerId: referrer.identity.subjectId,
        passengerId: id,
        createdAt: new Date().toISOString(),
      });
      input.json(201, { saved: true });
      return true;
    }
    input.json(404, {
      error: 'NOT_FOUND',
      message: 'Operação não encontrada.',
    });
    return true;
  } catch (e) {
    if (e instanceof GrowthError) {
      input.json(e.status, { error: 'GROWTH_ERROR', message: e.message });
      return true;
    }
    throw e;
  }
}
