abstract final class RamoCoreConfig {
  static const baseUrl = String.fromEnvironment(
    'RAMO_CORE_BASE_URL',
    defaultValue: '',
  );

  static const requestTimeout = Duration(seconds: 10);

  static bool get enabled => baseUrl.trim().isNotEmpty;
}
