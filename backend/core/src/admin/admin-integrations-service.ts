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
}

export function adminIntegrationSetupView(
  env: NodeJS.ProcessEnv = process.env,
): AdminIntegrationSetupView {
  const serverKey = env.GOOGLE_MAPS_SERVER_API_KEY?.trim() ?? '';
  const routingProvider =
    env.ROUTING_PROVIDER?.trim().toLowerCase() || 'google';

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
  };
}
