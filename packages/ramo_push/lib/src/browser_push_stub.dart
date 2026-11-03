Future<bool> startBrowserPush({
  required Uri baseUrl,
  required String accessToken,
  required String preference,
  required bool requestPermission,
}) async => false;
Future<bool> setBrowserPushPreference(String preference) async => false;
Future<void> stopBrowserPush() async {}
String browserPushStatus() => 'native';
Future<Map<String, Object?>> browserSetupSnapshot() async => {};
Future<String> requestBrowserSetupLocation() async => 'unsupported';
Future<String> installBrowserSetupApp() async => 'manual';
void startNotificationIntentBridge() {}
