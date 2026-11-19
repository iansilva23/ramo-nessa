import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/core/auth/auth_token_store.dart';
import 'package:ramo_nessa_driver/src/core/auth/password_auth_service.dart';
import 'package:ramo_nessa_driver/src/core/auth/driver_password_login_screen.dart';
import 'package:ramo_nessa_driver/src/core/auth/driver_password_auth_service.dart';

class Store implements AuthTokenStore {
  String? token;
  @override
  Future<String?> readAccessToken() async => token;
  @override
  Future<void> saveAccessToken(String value) async {
    token = value;
  }

  @override
  Future<void> clearAccessToken() async {
    token = null;
  }
}

class Service implements PasswordAuthService, DriverPasswordAuthService {
  int loginCalls = 0, registerCalls = 0;
  bool fail = false;
  String? identifier;
  AuthSession get session => AuthSession(
    accessToken: 'abcdefghijklmnopqrstuvwxyz123456',
    expiresAt: DateTime.now().add(const Duration(days: 1)),
    subjectId: 'driver-test',
    subjectType: 'driver',
  );
  @override
  Future<AuthSession> loginWithPassword({
    required String identifier,
    required String password,
  }) async {
    loginCalls++;
    this.identifier = identifier;
    if (fail) {
      throw Exception('Acesso inválido.');
    }
    return session;
  }

  @override
  Future<AuthSession> registerWithPassword({
    required String fullName,
    required String phone,
    required String email,
    required String password,
    String? username,
  }) async {
    registerCalls++;
    return session;
  }

  @override
  Future<AuthSessionInfo?> currentSession(String token) async => null;
  @override
  Future<void> logout(String token) async {}

  @override
  Future<DriverLoginCredentials> loginCredentials(String token) async =>
      const DriverLoginCredentials(configured: false);
  @override
  Future<void> createLoginCredentials({
    required String accessToken,
    required String username,
    required String email,
    required String password,
  }) async {}
}

Future<void> tap(WidgetTester t, String key) async {
  final f = find.byKey(Key(key));
  await t.ensureVisible(f);
  await t.tap(f);
  await t.pumpAndSettle();
}

void main() {
  Widget app(Service s, Store store) => MaterialApp(
    home: DriverPasswordLoginScreen(
      phoneService: s,
      passwordService: s,
      tokenStore: store,
      onAuthenticated: (_) {},
    ),
  );
  testWidgets('landing, login, back and registration share one coherent flow', (
    t,
  ) async {
    final s = Service(), store = Store();
    await t.pumpWidget(app(s, store));
    expect(find.text('Seja um motorista parceiro'), findsOneWidget);
    expect(find.text('Esqueci minha senha'), findsNothing);
    expect(find.byKey(const Key('auth-code-field')), findsNothing);
    await tap(t, 'auth-login-button');
    await t.enterText(find.byKey(const Key('auth-email-field')), 'driver.name');
    await t.enterText(
      find.byKey(const Key('auth-password-field')),
      'Example12345',
    );
    await tap(t, 'auth-primary-button');
    expect(s.loginCalls, 1);
    expect(store.token, isNotNull);
    await tap(t, 'auth-back-button');
    await tap(t, 'auth-create-account-button');
    await t.enterText(find.byKey(const Key('auth-name-field')), 'Conta Teste');
    await t.enterText(
      find.byKey(const Key("auth-username-field")),
      "driver.name",
    );
    await t.enterText(find.byKey(const Key('auth-phone-field')), '88999994321');
    await t.enterText(
      find.byKey(const Key('auth-email-field')),
      'account@example.test',
    );
    await t.enterText(
      find.byKey(const Key('auth-password-field')),
      'Example12345',
    );
    await tap(t, 'auth-primary-button');
    expect(s.registerCalls, 1);
    expect(find.byKey(const Key('auth-code-field')), findsNothing);
  });
  testWidgets('wrong password keeps the form and does not save a session', (
    t,
  ) async {
    final s = Service()..fail = true, store = Store();
    await t.pumpWidget(app(s, store));
    await tap(t, 'auth-login-button');
    await t.enterText(
      find.byKey(const Key('auth-email-field')),
      'account@example.test',
    );
    await t.enterText(
      find.byKey(const Key('auth-password-field')),
      'WrongPassword123',
    );
    await tap(t, 'auth-primary-button');
    expect(store.token, isNull);
    expect(find.byKey(const Key('auth-error')), findsOneWidget);
  });
}
