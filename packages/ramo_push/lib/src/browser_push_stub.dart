Future<bool> startBrowserPush({
  required Uri baseUrl,
  required String accessToken,
  required String preference,
  required bool requestPermission,
}) async => false;
Future<bool> setBrowserPushPreference(String preference) async => false;
Future<void> stopBrowserPush() async {}
String browserPushStatus() => 'native';
