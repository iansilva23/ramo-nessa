abstract final class RamoCoreConfig {
  static const baseUrl = String.fromEnvironment(
    'RAMO_CORE_BASE_URL',
    defaultValue: '',
  );

  static const requestTimeout = Duration(seconds: 10);

  // Temporário para desenvolvimento até autenticação real entrar.
  static const devPassengerId = String.fromEnvironment(
    'RAMO_DEV_PASSENGER_ID',
    defaultValue: '',
  );

  static bool get enabled => baseUrl.trim().isNotEmpty;

  static bool get devPassengerIdentityEnabled =>
      enabled && devPassengerId.trim().length >= 3;
}
