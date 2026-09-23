abstract final class DriverCoreConfig {
  static const baseUrl = String.fromEnvironment(
    'RAMO_CORE_BASE_URL',
    defaultValue: '',
  );

  static const devDriverId = String.fromEnvironment(
    'RAMO_DEV_DRIVER_ID',
    defaultValue: '',
  );

  static const requestTimeout = Duration(seconds: 10);
  static const offerPollingInterval = Duration(seconds: 3);

  static bool get enabled =>
      baseUrl.trim().isNotEmpty && devDriverId.trim().length >= 3;
}
