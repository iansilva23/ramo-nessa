import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:ramo_nessa_passenger/src/core/auth/secure_auth_token_store.dart';

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
}
