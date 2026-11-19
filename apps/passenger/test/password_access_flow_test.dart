import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/core/auth/auth_token_store.dart';
import 'package:ramo_nessa_passenger/src/core/auth/password_auth_service.dart';
import 'package:ramo_nessa_passenger/src/core/auth/passenger_auth_screen.dart';

import 'dart:typed_data';

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

class Service implements PasswordAuthService {
  int loginCalls = 0, registerCalls = 0;
  bool fail = false;
  String? identifier;
  AuthSession get session => AuthSession(
    accessToken: 'abcdefghijklmnopqrstuvwxyz123456',
    expiresAt: DateTime.now().add(const Duration(days: 1)),
    subjectId: 'passenger-test',
    subjectType: 'passenger',
  );
  @override
  Future<AuthSession> loginWithPassword({
    required String email,
    required String password,
  }) async {
    loginCalls++;
    identifier = email;
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
  Future<PassengerAccount> passengerAccount(String token) async =>
      const PassengerAccount(
        subjectId: 'passenger-test',
        phoneE164: '+5588999994321',
      );
  @override
  Future<PassengerAccount> updatePassengerAccount({
    required String accessToken,
    String? fullName,
    String? email,
    String? password,
  }) => passengerAccount(accessToken);
  @override
  Future<PassengerAccount> updatePassengerPhoto({
    required String accessToken,
    required Uint8List bytes,
    required String mimeType,
  }) => passengerAccount(accessToken);
  @override
  Future<AuthSecuritySession> securitySession(String token) async =>
      throw UnimplementedError();
  @override
  Future<RevokeOtherSessionsResult> revokeOtherSessions(String token) async =>
      const RevokeOtherSessionsResult(revokedSessions: 0, disabledDevices: 0);
}

Future<void> tap(WidgetTester t, String key) async {
  final f = find.byKey(Key(key));
  await t.ensureVisible(f);
  await t.tap(f);
  await t.pumpAndSettle();
}

void main() {
  Widget app(Service s, Store store) => MaterialApp(
    home: PassengerAuthScreen(
      service: s,
      tokenStore: store,
      onAuthenticated: (_) {},
    ),
  );
  testWidgets('landing, login, back and registration share one coherent flow', (
    t,
  ) async {
    final s = Service(), store = Store();
    await t.pumpWidget(app(s, store));
    expect(find.text('Criar conta'), findsOneWidget);
    expect(find.text('Esqueci minha senha'), findsNothing);
    expect(find.byKey(const Key('auth-code-field')), findsNothing);
    await tap(t, 'auth-login-button');
    await t.enterText(
      find.byKey(const Key('auth-email-field')),
      'passenger@example.test',
    );
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
