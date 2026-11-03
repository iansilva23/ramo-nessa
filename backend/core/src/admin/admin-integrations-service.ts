export interface AdminIntegrationSetupView {
  googleMaps: {
    provider: 'google';
    server: {
      configured: boolean;
      routingProviderValid: boolean;
      runtimeEnvironmentVariable: 'GOOGLE_MAPS_SERVER_API_KEY';
      deploymentSecretName: 'RAMO_GOOGLE_MAPS_SERVER_API_KEY';
      allowedApis: readonly ['Routes API', 'Places API (New)'];
    };
    android: readonly [
      {
        app: 'passenger';
        label: 'Passageiro Android';
        packageName: 'br.com.ramonessa.passenger';
        githubSecretName: 'RAMO_GOOGLE_MAPS_ANDROID_PASSENGER_API_KEY';
        allowedApi: 'Maps SDK for Android';
      },
      {
        app: 'driver';
        label: 'Motorista Android';
        packageName: 'br.com.ramonessa.driver';
        githubSecretName: 'RAMO_GOOGLE_MAPS_ANDROID_DRIVER_API_KEY';
        allowedApi: 'Maps SDK for Android';
      },
    ];
    ios: readonly [
      {
        app: 'passenger';
        label: 'Passageiro iOS';
        bundleId: 'br.com.ramonessa.passenger';
        githubSecretName: 'RAMO_GOOGLE_MAPS_IOS_PASSENGER_API_KEY';
        allowedApi: 'Maps SDK for iOS';
      },
      {
        app: 'driver';
        label: 'Motorista iOS';
        bundleId: 'br.com.ramonessa.driver';
        githubSecretName: 'RAMO_GOOGLE_MAPS_IOS_DRIVER_API_KEY';
        allowedApi: 'Maps SDK for iOS';
      },
    ];
  };
  mercadoPago: {
    mode: 'production' | 'test';
    accessTokenConfigured: boolean;
    webhookSecretConfigured: boolean;
    productionReady: boolean;
    accessTokenEnvironmentVariable:
      | 'MERCADO_PAGO_ACCESS_TOKEN'
      | 'MERCADO_PAGO_ACCESS_TOKEN_TEST';
    webhookSecretEnvironmentVariable: 'MERCADO_PAGO_WEBHOOK_SECRET';
  };
  otp: {
    provider: 'entrar-whatsapp' | 'webhook' | 'dev' | 'missing' | 'invalid';
    endpointConfigured: boolean;
    tokenConfigured: boolean;
    productionReady: boolean;
    providerEnvironmentVariable: 'OTP_PROVIDER';
    endpointEnvironmentVariable: 'OTP_WEBHOOK_URL' | null;
    tokenEnvironmentVariable: 'OTP_WEBHOOK_TOKEN' | 'ENTRAR_API_SECRET';
  };
  push: {
    provider: 'fcm' | 'webhook' | 'disabled' | 'invalid';
    firebaseCredentialConfigured: boolean;
    firebaseCredentialSource: 'json' | 'file' | 'missing';
    webhookEndpointConfigured: boolean;
    webhookSecretConfigured: boolean;
    productionReady: boolean;
    providerEnvironmentVariable: 'PUSH_PROVIDER';
    firebaseJsonEnvironmentVariable: 'FIREBASE_SERVICE_ACCOUNT_JSON';
    firebaseFileEnvironmentVariable: 'FIREBASE_SERVICE_ACCOUNT_FILE';
    webhookEndpointEnvironmentVariable: 'PUSH_WEBHOOK_URL';
    webhookSecretEnvironmentVariable: 'PUSH_WEBHOOK_SECRET';
  };
}

function validHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function adminIntegrationSetupView(
  env: NodeJS.ProcessEnv = process.env,
): AdminIntegrationSetupView {
  const serverKey = env.GOOGLE_MAPS_SERVER_API_KEY?.trim() ?? '';
  const routingProvider =
    env.ROUTING_PROVIDER?.trim().toLowerCase() || 'google';

  const mercadoPagoMode =
    env.MERCADO_PAGO_MODE?.trim().toLowerCase() === 'production'
      ? 'production'
      : 'test';
  const mercadoPagoAccessTokenVariable =
    mercadoPagoMode === 'production'
      ? 'MERCADO_PAGO_ACCESS_TOKEN'
      : 'MERCADO_PAGO_ACCESS_TOKEN_TEST';
  const mercadoPagoAccessToken =
    env[mercadoPagoAccessTokenVariable]?.trim() ?? '';
  const mercadoPagoWebhookSecret =
    env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ?? '';

  const rawOtpProvider = env.OTP_PROVIDER?.trim().toLowerCase();
  const production = env.NODE_ENV === 'production';
  const otpProvider:
    | 'entrar-whatsapp'
    | 'webhook'
    | 'dev'
    | 'missing'
    | 'invalid' =
    rawOtpProvider === 'entrar-whatsapp'
      ? 'entrar-whatsapp'
      : rawOtpProvider === 'webhook'
      ? 'webhook'
      : rawOtpProvider === 'dev'
        ? 'dev'
        : rawOtpProvider == null || rawOtpProvider === ''
          ? production
            ? 'missing'
            : 'dev'
          : 'invalid';
  const otpEndpoint = otpProvider === 'entrar-whatsapp' ? 'https://cpf.entrar.api.br/api/otp/send' : env.OTP_WEBHOOK_URL?.trim() ?? '';
  const otpToken = (otpProvider === 'entrar-whatsapp' ? env.ENTRAR_API_SECRET : env.OTP_WEBHOOK_TOKEN)?.trim() ?? '';
  const otpEndpointConfigured = validHttpsUrl(otpEndpoint);
  const otpTokenConfigured = otpProvider === 'entrar-whatsapp' ? otpToken.length > 0 && !/[\s\x00-\x1f]/.test(otpToken) : otpToken.length >= 20;

  const rawPushProvider = env.PUSH_PROVIDER?.trim().toLowerCase() ?? '';
  const pushProvider: 'fcm' | 'webhook' | 'disabled' | 'invalid' =
    rawPushProvider === 'fcm'
      ? 'fcm'
      : rawPushProvider === 'webhook'
        ? 'webhook'
        : rawPushProvider === '' || rawPushProvider === 'disabled'
          ? 'disabled'
          : 'invalid';
  const firebaseServiceAccountJson =
    env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ?? '';
  const firebaseServiceAccountFile =
    env.FIREBASE_SERVICE_ACCOUNT_FILE?.trim() ?? '';
  const firebaseCredentialSource: 'json' | 'file' | 'missing' =
    firebaseServiceAccountJson
      ? 'json'
      : firebaseServiceAccountFile
        ? 'file'
        : 'missing';
  const pushWebhookEndpoint = env.PUSH_WEBHOOK_URL?.trim() ?? '';
  const pushWebhookSecret = env.PUSH_WEBHOOK_SECRET?.trim() ?? '';
  const pushWebhookEndpointConfigured = validHttpsUrl(pushWebhookEndpoint);
  const pushWebhookSecretConfigured = pushWebhookSecret.length >= 16;
  const pushProductionReady =
    pushProvider === 'fcm'
      ? firebaseCredentialSource !== 'missing'
      : pushProvider === 'webhook'
        ? pushWebhookEndpointConfigured && pushWebhookSecretConfigured
        : false;

  return {
    googleMaps: {
      provider: 'google',
      server: {
        configured: serverKey.length >= 20,
        routingProviderValid: routingProvider === 'google',
        runtimeEnvironmentVariable: 'GOOGLE_MAPS_SERVER_API_KEY',
        deploymentSecretName: 'RAMO_GOOGLE_MAPS_SERVER_API_KEY',
        allowedApis: ['Routes API', 'Places API (New)'],
      },
      android: [
        {
          app: 'passenger',
          label: 'Passageiro Android',
          packageName: 'br.com.ramonessa.passenger',
          githubSecretName:
            'RAMO_GOOGLE_MAPS_ANDROID_PASSENGER_API_KEY',
          allowedApi: 'Maps SDK for Android',
        },
        {
          app: 'driver',
          label: 'Motorista Android',
          packageName: 'br.com.ramonessa.driver',
          githubSecretName:
            'RAMO_GOOGLE_MAPS_ANDROID_DRIVER_API_KEY',
          allowedApi: 'Maps SDK for Android',
        },
      ],
      ios: [
        {
          app: 'passenger',
          label: 'Passageiro iOS',
          bundleId: 'br.com.ramonessa.passenger',
          githubSecretName:
            'RAMO_GOOGLE_MAPS_IOS_PASSENGER_API_KEY',
          allowedApi: 'Maps SDK for iOS',
        },
        {
          app: 'driver',
          label: 'Motorista iOS',
          bundleId: 'br.com.ramonessa.driver',
          githubSecretName:
            'RAMO_GOOGLE_MAPS_IOS_DRIVER_API_KEY',
          allowedApi: 'Maps SDK for iOS',
        },
      ],
    },
    mercadoPago: {
      mode: mercadoPagoMode,
      accessTokenConfigured: mercadoPagoAccessToken.length >= 20,
      webhookSecretConfigured:
        mercadoPagoWebhookSecret.length >= 16,
      productionReady:
        mercadoPagoMode === 'production' &&
        mercadoPagoAccessToken.length >= 20 &&
        mercadoPagoWebhookSecret.length >= 16,
      accessTokenEnvironmentVariable:
        mercadoPagoAccessTokenVariable,
      webhookSecretEnvironmentVariable:
        'MERCADO_PAGO_WEBHOOK_SECRET',
    },
    otp: {
      provider: otpProvider,
      endpointConfigured: otpEndpointConfigured,
      tokenConfigured: otpTokenConfigured,
      productionReady:
        (otpProvider === 'webhook' || otpProvider === 'entrar-whatsapp') &&
        otpEndpointConfigured &&
        otpTokenConfigured,
      providerEnvironmentVariable: 'OTP_PROVIDER',
      endpointEnvironmentVariable: otpProvider === 'entrar-whatsapp' ? null : 'OTP_WEBHOOK_URL',
      tokenEnvironmentVariable: otpProvider === 'entrar-whatsapp' ? 'ENTRAR_API_SECRET' : 'OTP_WEBHOOK_TOKEN',
    },
    push: {
      provider: pushProvider,
      firebaseCredentialConfigured:
        firebaseCredentialSource !== 'missing',
      firebaseCredentialSource,
      webhookEndpointConfigured: pushWebhookEndpointConfigured,
      webhookSecretConfigured: pushWebhookSecretConfigured,
      productionReady: pushProductionReady,
      providerEnvironmentVariable: 'PUSH_PROVIDER',
      firebaseJsonEnvironmentVariable:
        'FIREBASE_SERVICE_ACCOUNT_JSON',
      firebaseFileEnvironmentVariable:
        'FIREBASE_SERVICE_ACCOUNT_FILE',
      webhookEndpointEnvironmentVariable: 'PUSH_WEBHOOK_URL',
      webhookSecretEnvironmentVariable: 'PUSH_WEBHOOK_SECRET',
    },
  };
}
