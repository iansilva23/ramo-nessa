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
    provider: 'webhook' | 'dev' | 'missing' | 'invalid';
    endpointConfigured: boolean;
    tokenConfigured: boolean;
    productionReady: boolean;
    providerEnvironmentVariable: 'OTP_PROVIDER';
    endpointEnvironmentVariable: 'OTP_WEBHOOK_URL';
    tokenEnvironmentVariable: 'OTP_WEBHOOK_TOKEN';
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
    | 'webhook'
    | 'dev'
    | 'missing'
    | 'invalid' =
    rawOtpProvider === 'webhook'
      ? 'webhook'
      : rawOtpProvider === 'dev'
        ? 'dev'
        : rawOtpProvider == null || rawOtpProvider === ''
          ? production
            ? 'missing'
            : 'dev'
          : 'invalid';
  const otpEndpoint = env.OTP_WEBHOOK_URL?.trim() ?? '';
  const otpToken = env.OTP_WEBHOOK_TOKEN?.trim() ?? '';
  const otpEndpointConfigured = validHttpsUrl(otpEndpoint);
  const otpTokenConfigured = otpToken.length >= 20;

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
        otpProvider === 'webhook' &&
        otpEndpointConfigured &&
        otpTokenConfigured,
      providerEnvironmentVariable: 'OTP_PROVIDER',
      endpointEnvironmentVariable: 'OTP_WEBHOOK_URL',
      tokenEnvironmentVariable: 'OTP_WEBHOOK_TOKEN',
    },
  };
}
