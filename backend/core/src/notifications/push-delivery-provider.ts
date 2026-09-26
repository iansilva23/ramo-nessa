import { createSign, randomUUID } from 'node:crypto';
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
      throw new Error(`Provider push respondeu HTTP ${response.status}.`);
    }
    return { delivered: true };
  }
}

interface FirebaseServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

interface GoogleAccessTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

const googleOAuthTokenUrl = 'https://oauth2.googleapis.com/token';
const firebaseMessagingScope =
  'https://www.googleapis.com/auth/firebase.messaging';

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function parseFirebaseServiceAccount(raw: string): FirebaseServiceAccount {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON não contém JSON válido.',
    );
  }

  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Credencial Firebase service account é inválida.');
  }

  const record = value as Record<string, unknown>;
  const projectId =
    typeof record.project_id === 'string' ? record.project_id.trim() : '';
  const clientEmail =
    typeof record.client_email === 'string'
      ? record.client_email.trim()
      : '';
  const privateKey =
    typeof record.private_key === 'string'
      ? record.private_key.trim()
      : '';

  if (
    projectId.length < 3 ||
    clientEmail.length < 6 ||
    !clientEmail.includes('@') ||
    !privateKey.includes('PRIVATE KEY')
  ) {
    throw new Error(
      'Service account Firebase precisa de project_id, client_email e private_key.',
    );
  }

  return { projectId, clientEmail, privateKey };
}

function loadFirebaseServiceAccount(): FirebaseServiceAccount {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) return parseFirebaseServiceAccount(inline);

  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE?.trim();
  if (file) {
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_FILE não pôde ser lido.',
      );
    }
    return parseFirebaseServiceAccount(raw);
  }

  throw new Error(
    'Configure FIREBASE_SERVICE_ACCOUNT_JSON ou FIREBASE_SERVICE_ACCOUNT_FILE para PUSH_PROVIDER=fcm.',
  );
}

function parseFcmErrorCode(body: string): string | null {
  try {
    const value = JSON.parse(body) as {
      error?: {
        details?: Array<{
          '@type'?: unknown;
          errorCode?: unknown;
        }>;
      };
    };
    for (const detail of value.error?.details ?? []) {
      if (
        detail['@type'] ===
          'type.googleapis.com/google.firebase.fcm.v1.FcmError' &&
        typeof detail.errorCode === 'string'
      ) {
        return detail.errorCode;
      }
    }
  } catch {
    // Resposta não-JSON será tratada pelo status HTTP.
  }
  return null;
}

class FcmPushDeliveryProvider implements PushDeliveryProvider {
  readonly kind = 'fcm';

  private accessToken: string | null = null;
  private accessTokenExpiresAtMs = 0;

  constructor(private readonly serviceAccount: FirebaseServiceAccount) {}

  private async getAccessToken(): Promise<string> {
    const nowMs = Date.now();
    if (
      this.accessToken != null &&
      nowMs < this.accessTokenExpiresAtMs - 60_000
    ) {
      return this.accessToken;
    }

    const nowSeconds = Math.floor(nowMs / 1000);
    const header = base64Url(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    );
    const claims = base64Url(
      JSON.stringify({
        iss: this.serviceAccount.clientEmail,
        scope: firebaseMessagingScope,
        aud: googleOAuthTokenUrl,
        iat: nowSeconds,
        exp: nowSeconds + 3600,
        jti: randomUUID(),
      }),
    );
    const unsigned = `${header}.${claims}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const signature = signer
      .sign(this.serviceAccount.privateKey)
      .toString('base64url');
    const assertion = `${unsigned}.${signature}`;

    const response = await fetch(googleOAuthTokenUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `OAuth do Firebase respondeu HTTP ${response.status}.`,
      );
    }

    let parsed: GoogleAccessTokenResponse;
    try {
      parsed = JSON.parse(body) as GoogleAccessTokenResponse;
    } catch {
      throw new Error('OAuth do Firebase retornou resposta inválida.');
    }

    const token =
      typeof parsed.access_token === 'string'
        ? parsed.access_token.trim()
        : '';
    const expiresIn =
      typeof parsed.expires_in === 'number' &&
      Number.isFinite(parsed.expires_in)
        ? Math.max(60, Math.floor(parsed.expires_in))
        : 3600;

    if (token.length < 20) {
      throw new Error('OAuth do Firebase não retornou access token.');
    }

    this.accessToken = token;
    this.accessTokenExpiresAtMs = nowMs + expiresIn * 1000;
    return token;
  }

  async send(input: PushDeliveryRequest): Promise<PushDeliveryResult> {
    if (input.tokenProvider !== 'fcm') {
      return { delivered: false };
    }

    const accessToken = await this.getAccessToken();
    const endpoint =
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
        this.serviceAccount.projectId,
      )}/messages:send`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json; charset=utf-8',
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
    });

    const body = await response.text();
    if (response.ok) {
      return { delivered: true };
    }

    const fcmCode = parseFcmErrorCode(body);
    if (fcmCode === 'UNREGISTERED') {
      return { delivered: false, invalidToken: true };
    }

    throw new Error(
      `Firebase Cloud Messaging respondeu HTTP ${response.status}${
        fcmCode == null ? '' : ` (${fcmCode})`
      }.`,
    );
  }
}

export function resolvePushDeliveryProviderFromEnv(): PushDeliveryProvider {
  const kind = process.env.PUSH_PROVIDER?.trim().toLowerCase();
  if (kind == null || kind === '' || kind === 'disabled') {
    return new DisabledPushDeliveryProvider();
  }

  if (kind === 'fcm') {
    return new FcmPushDeliveryProvider(loadFirebaseServiceAccount());
  }

  if (kind !== 'webhook') {
    throw new Error(
      'PUSH_PROVIDER deve ser disabled, webhook ou fcm.',
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
  if (
    endpoint.protocol !== 'https:' &&
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error('PUSH_WEBHOOK_URL deve usar HTTPS em produção.');
  }

  return new WebhookPushDeliveryProvider(endpoint, secret);
}
