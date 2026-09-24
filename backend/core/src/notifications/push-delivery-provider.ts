import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type {
  PushPlatform,
  PushTokenProvider,
} from './push-device-repository.js';

export interface PushMessage {
  type: string;
  title: string;
  body: string;
  data?: Readonly<Record<string, string>>;
}

export interface PushDeliveryRequest {
  token: string;
  tokenProvider: PushTokenProvider;
  platform: PushPlatform;
  message: PushMessage;
}

export interface PushDeliveryResult {
  delivered: boolean;
  invalidToken?: boolean;
}

export interface PushDeliveryProvider {
  readonly kind: string;
  send(input: PushDeliveryRequest): Promise<PushDeliveryResult>;
}

type PushFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

class DisabledPushDeliveryProvider implements PushDeliveryProvider {
  readonly kind = 'disabled';

  async send(): Promise<PushDeliveryResult> {
    return { delivered: false };
  }
}

class WebhookPushDeliveryProvider implements PushDeliveryProvider {
  readonly kind = 'webhook';

  constructor(
    private readonly endpoint: URL,
    private readonly secret: string,
  ) {}

  async send(input: PushDeliveryRequest): Promise<PushDeliveryResult> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: input.token,
        tokenProvider: input.tokenProvider,
        platform: input.platform,
        message: input.message,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (response.status === 404 || response.status === 410) {
      return { delivered: false, invalidToken: true };
    }
    if (!response.ok) {
      throw new Error(
        `Provider push respondeu HTTP ${response.status}.`,
      );
    }
    return { delivered: true };
  }
}

export interface FcmAccessTokenSource {
  getAccessToken(): Promise<string>;
}

export class GoogleServiceAccountAccessTokenSource
  implements FcmAccessTokenSource {
  private cached:
    | { token: string; expiresAtMs: number }
    | null = null;

  constructor(
    private readonly clientEmail: string,
    private readonly privateKey: string,
    private readonly fetcher: PushFetch = (url, init) => fetch(url, init),
  ) {}

  async getAccessToken(): Promise<string> {
    const nowMs = Date.now();
    if (
      this.cached != null &&
      this.cached.expiresAtMs > nowMs + 60_000
    ) {
      return this.cached.token;
    }

    const nowSeconds = Math.floor(nowMs / 1000);
    const encodedHeader = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
      'utf8',
    ).toString('base64url');
    const encodedClaims = Buffer.from(
      JSON.stringify({
        iss: this.clientEmail,
        scope:
          'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSeconds,
        exp: nowSeconds + 3600,
      }),
      'utf8',
    ).toString('base64url');
    const unsigned = `${encodedHeader}.${encodedClaims}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const signature = signer
      .sign(this.privateKey)
      .toString('base64url');
    const assertion = `${unsigned}.${signature}`;

    const response = await this.fetcher(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'content-type':
            'application/x-www-form-urlencoded; charset=utf-8',
        },
        body: new URLSearchParams({
          grant_type:
            'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
        signal: AbortSignal.timeout(8_000),
      },
    );

    const payload = await response.json() as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (
      !response.ok ||
      typeof payload.access_token !== 'string' ||
      typeof payload.expires_in !== 'number'
    ) {
      throw new Error(
        'Não foi possível obter token OAuth do Firebase.',
      );
    }

    this.cached = {
      token: payload.access_token,
      expiresAtMs:
        nowMs + Math.max(60, payload.expires_in) * 1000,
    };
    return this.cached.token;
  }
}

export class FcmPushDeliveryProvider
  implements PushDeliveryProvider {
  readonly kind = 'fcm';

  constructor(
    private readonly projectId: string,
    private readonly accessTokens: FcmAccessTokenSource,
    private readonly fetcher: PushFetch = (url, init) => fetch(url, init),
  ) {}

  async send(input: PushDeliveryRequest): Promise<PushDeliveryResult> {
    if (input.tokenProvider !== 'fcm') {
      return { delivered: false };
    }

    const accessToken = await this.accessTokens.getAccessToken();
    const response = await this.fetcher(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: input.token,
            notification: {
              title: input.message.title,
              body: input.message.body,
            },
            data: {
              type: input.message.type,
              ...(input.message.data ?? {}),
            },
            android: {
              priority: 'high',
              notification: {
                sound: 'default',
              },
            },
            apns: {
              headers: {
                'apns-priority': '10',
              },
              payload: {
                aps: {
                  sound: 'default',
                },
              },
            },
          },
        }),
        signal: AbortSignal.timeout(8_000),
      },
    );

    if (response.ok) {
      return { delivered: true };
    }

    const responseBody = await response.text();
    if (/UNREGISTERED|registration-token-not-registered/i.test(responseBody)) {
      return { delivered: false, invalidToken: true };
    }

    throw new Error(
      `FCM respondeu HTTP ${response.status}.`,
    );
  }
}

interface FirebaseServiceAccountFile {
  project_id?: unknown;
  client_email?: unknown;
  private_key?: unknown;
}

export function readFirebaseServiceAccountFile(path: string): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
} {
  let parsed: FirebaseServiceAccountFile;
  try {
    parsed = JSON.parse(
      readFileSync(path, 'utf8'),
    ) as FirebaseServiceAccountFile;
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_FILE não pôde ser lido como JSON válido.',
    );
  }

  const projectId =
    typeof parsed.project_id === 'string'
      ? parsed.project_id.trim()
      : '';
  const clientEmail =
    typeof parsed.client_email === 'string'
      ? parsed.client_email.trim()
      : '';
  const privateKey =
    typeof parsed.private_key === 'string'
      ? parsed.private_key.trim()
      : '';

  if (
    projectId.length < 3 ||
    clientEmail.length < 5 ||
    privateKey.length < 100
  ) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_FILE não contém credenciais Firebase válidas.',
    );
  }

  return { projectId, clientEmail, privateKey };
}

export function resolvePushDeliveryProviderFromEnv(): PushDeliveryProvider {
  const kind = process.env.PUSH_PROVIDER?.trim().toLowerCase();
  if (kind == null || kind === '' || kind === 'disabled') {
    return new DisabledPushDeliveryProvider();
  }

  if (kind === 'fcm') {
    const serviceAccountFile =
      process.env.FIREBASE_SERVICE_ACCOUNT_FILE?.trim();

    const credentials =
      serviceAccountFile != null && serviceAccountFile !== ''
        ? readFirebaseServiceAccountFile(serviceAccountFile)
        : {
            projectId:
              process.env.FIREBASE_PROJECT_ID?.trim() ?? '',
            clientEmail:
              process.env.FIREBASE_CLIENT_EMAIL?.trim() ?? '',
            privateKey:
              process.env.FIREBASE_PRIVATE_KEY
                ?.replace(/\\n/g, '\n')
                .trim() ?? '',
          };

    if (
      credentials.projectId.length < 3 ||
      credentials.clientEmail.length < 5 ||
      credentials.privateKey.length < 100
    ) {
      throw new Error(
        'Para PUSH_PROVIDER=fcm, configure FIREBASE_SERVICE_ACCOUNT_FILE ou as três variáveis Firebase separadas.',
      );
    }

    return new FcmPushDeliveryProvider(
      credentials.projectId,
      new GoogleServiceAccountAccessTokenSource(
        credentials.clientEmail,
        credentials.privateKey,
      ),
    );
  }

  if (kind !== 'webhook') {
    throw new Error(
      'PUSH_PROVIDER deve ser disabled, fcm ou webhook.',
    );
  }

  const rawUrl = process.env.PUSH_WEBHOOK_URL?.trim();
  const secret = process.env.PUSH_WEBHOOK_SECRET?.trim();
  if (rawUrl == null || secret == null || secret.length < 16) {
    throw new Error(
      'PUSH_WEBHOOK_URL e PUSH_WEBHOOK_SECRET são obrigatórios para push webhook.',
    );
  }

  const endpoint = new URL(rawUrl);
  if (endpoint.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('PUSH_WEBHOOK_URL deve usar HTTPS em produção.');
  }

  return new WebhookPushDeliveryProvider(endpoint, secret);
}
