import 'package:flutter/foundation.dart';

abstract final class DriverCoreConfig {
  static const previewMode = bool.fromEnvironment(
    'RAMO_PREVIEW_MODE',
    defaultValue: false,
  );

  static const baseUrl = String.fromEnvironment(
    'RAMO_CORE_BASE_URL',
    defaultValue: '',
  );

  static const devDriverId = String.fromEnvironment(
    'RAMO_DEV_DRIVER_ID',
    defaultValue: '',
  );

  static const requestTimeout = Duration(seconds: 10);

  static const appVersion = String.fromEnvironment(
    'RAMO_APP_VERSION',
    defaultValue: '0.1.0',
  );

  static const appBuild = int.fromEnvironment(
    'RAMO_APP_BUILD',
    defaultValue: 1,
  );
  static const offerPollingInterval = Duration(seconds: 10);

  static Uri? get baseUri {
    final uri = Uri.tryParse(baseUrl.trim());
    if (
      uri == null ||
      !uri.hasScheme ||
      uri.host.isEmpty ||
      (uri.scheme != 'http' && uri.scheme != 'https')
    ) {
      return null;
    }

    // Release nunca deve apontar o Core para HTTP sem TLS.
    if (kReleaseMode && uri.scheme != 'https') return null;
    return uri;
  }

  static bool get devDriverIdentityEnabled =>
      !kReleaseMode &&
      baseUri != null &&
      devDriverId.trim().length >= 3;

  static bool get enabled => baseUri != null;

}
