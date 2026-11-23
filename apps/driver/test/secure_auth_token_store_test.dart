import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:ramo_nessa_driver/src/core/auth/secure_auth_token_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('malformed token is rejected without including its value in the error', () async {
    final store = SecureAuthTokenStore();
    for (final raw in ['private-fixture', 'a' * 25 + '\nAuthorization: private-fixture', 'a' * 4097]) {
      try {
        await store.saveAccessToken(raw);
        fail('Malformed credential must not be saved');
      } on ArgumentError catch (error) {
        expect(error.toString(), isNot(contains(raw)));
        expect(error.toString(), isNot(contains('private-fixture')));
      }
    }
    expect(await store.readAccessToken(), isNull);
  });

  test('valid opaque token restores and logout removes it', () async {
    final store = SecureAuthTokenStore();
    const token = 'abcdefghijklmnopqrstuvwxyz123456_-';
    await store.saveAccessToken('  $token  ');
    expect(await store.readAccessToken(), token);
    await store.clearAccessToken();
    expect(await store.readAccessToken(), isNull);
  });

  test('malformed persisted credential is not returned to HTTP services', () async {
    FlutterSecureStorage.setMockInitialValues({
      'ramo_nessa_access_token_v1': 'a' * 25 + '\nprivate-fixture',
    });
    expect(await SecureAuthTokenStore().readAccessToken(), isNull);
  });

  test('Web persists only its public handle and retires legacy private credentials', () async {
    const key = 'ramo_nessa_driver_access_token_v1';
    FlutterSecureStorage.setMockInitialValues({
      key: 'fixture-private-credential-abcdefghijklmnopqrstuvwxyz',
      'ramo_nessa_access_token_v1': 'old-shared-private-credential-abcdefghijklmnopqrstuvwxyz',
    });
    final store = SecureAuthTokenStore(browserSession: true);
    expect(await store.readAccessToken(), isNull);
    const storage = FlutterSecureStorage();
    expect(await storage.read(key: key), isNull);
    expect(await storage.read(key: 'ramo_nessa_access_token_v1'), isNull);
    const handle = 'ramo_web_driver_v1_0123456789abcdef0123456789abcdef';
    await store.saveAccessToken(handle);
    expect(await store.readAccessToken(), handle);
    expect(await storage.read(key: key), handle);
    await store.clearAccessToken();
    expect(await store.readAccessToken(), isNull);
  });

  test('Web rejects private token and another app handle without saving either', () async {
    final store = SecureAuthTokenStore(browserSession: true);
    for (final value in ['fixture-private-credential-abcdefghijklmnopqrstuvwxyz',
      'ramo_web_passenger_v1_0123456789abcdef0123456789abcdef']) {
      await expectLater(store.saveAccessToken(value), throwsArgumentError);
    }
    expect(await store.readAccessToken(), isNull);
  });

  test('Web cleanup retires other app private credential but preserves its public marker', () async {
    const key = 'ramo_nessa_passenger_access_token_v1';
    const storage = FlutterSecureStorage();
    FlutterSecureStorage.setMockInitialValues({key: 'old-other-private-credential-abcdefghijklmnopqrstuvwxyz'});
    await SecureAuthTokenStore(browserSession: true).readAccessToken();
    expect(await storage.read(key: key), isNull);
    const publicHandle = 'ramo_web_passenger_v1_0123456789abcdef0123456789abcdef';
    FlutterSecureStorage.setMockInitialValues({key: publicHandle});
    await SecureAuthTokenStore(browserSession: true).readAccessToken();
    expect(await storage.read(key: key), publicHandle);
  });
}
