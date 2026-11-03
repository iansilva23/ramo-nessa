import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/core/auth/auth_token_store.dart';
import 'package:ramo_nessa_driver/src/core/auth/phone_auth_service.dart';
import 'package:ramo_nessa_driver/src/core/auth/driver_password_auth_service.dart';
import 'package:ramo_nessa_driver/src/core/auth/driver_password_login_screen.dart';
import 'package:ramo_nessa_driver/src/core/auth/driver_password_setup_screen.dart';

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

class Service implements PhoneAuthService, DriverPasswordAuthService {
  int otpCalls = 0, passwordCalls = 0, resetCalls = 0, enrollCalls = 0;
  bool fail = false, configured = false;
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
    passwordCalls++;
    this.identifier = identifier;
    if (fail) throw Exception('Usuário, e-mail ou senha inválidos.');
    return session;
  }

  @override
  Future<RequestedOtp> requestOtp({required String phone}) async {
    otpCalls++;
    return RequestedOtp(
      challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expiresAt: DateTime.now().add(const Duration(minutes: 5)),
      retryAfterSeconds: 0,
    );
  }

  @override
  Future<AuthSession> verifyOtp({
    required String challengeId,
    required String code,
  }) async => session;
  @override
  Future<AuthSessionInfo?> currentSession(String token) async =>
      AuthSessionInfo(
        expiresAt: session.expiresAt,
        subjectId: session.subjectId,
        subjectType: 'driver',
      );
  @override
  Future<void> logout(String token) async {}
  @override
  Future<DriverLoginCredentials> loginCredentials(String token) async =>
      DriverLoginCredentials(
        configured: configured,
        username: configured ? 'driver.name' : null,
        email: configured ? 'driver@example.com' : null,
      );
  @override
  Future<void> createLoginCredentials({
    required String accessToken,
    required String username,
    required String email,
    required String password,
  }) async {
    enrollCalls++;
    configured = true;
  }

  @override
  Future<RequestedOtp> requestPasswordReset({
    required String identifier,
  }) async {
    resetCalls++;
    return RequestedOtp(
      challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expiresAt: DateTime.now().add(const Duration(minutes: 5)),
      retryAfterSeconds: 0,
    );
  }

  @override
  Future<AuthSession> completePasswordReset({
    required String challengeId,
    required String code,
    required String password,
  }) async {
    if (fail) throw Exception('Código inválido ou expirado.');
    return session;
  }
}

Future<void> tap(WidgetTester t, String key) async {
  final f = find.byKey(Key(key));
  await t.ensureVisible(f);
  await t.tap(f);
  await t.pumpAndSettle();
}

void main() {
  for (final id in ['driver.name', 'driver@example.com'])
    testWidgets('login with $id uses password and no WhatsApp', (t) async {
      final service = Service(), store = Store();
      String? token;
      await t.pumpWidget(
        MaterialApp(
          home: DriverPasswordLoginScreen(
            phoneService: service,
            passwordService: service,
            tokenStore: store,
            onAuthenticated: (value) => token = value,
          ),
        ),
      );
      await t.enterText(find.byKey(const Key('driver-login-identifier')), id);
      await t.enterText(
        find.byKey(const Key('driver-login-password')),
        'Example12345',
      );
      await tap(t, 'driver-login-submit');
      expect(service.identifier, id);
      expect(service.passwordCalls, 1);
      expect(service.otpCalls, 0);
      expect(service.resetCalls, 0);
      expect(token, store.token);
      expect(token, isNotNull);
    });
  testWidgets('failed password does not store a session', (t) async {
    final service = Service()..fail = true, store = Store();
    await t.pumpWidget(
      MaterialApp(
        home: DriverPasswordLoginScreen(
          phoneService: service,
          passwordService: service,
          tokenStore: store,
          onAuthenticated: (_) => fail('Unexpected login'),
        ),
      ),
    );
    await t.enterText(
      find.byKey(const Key('driver-login-identifier')),
      'driver.name',
    );
    await t.enterText(
      find.byKey(const Key('driver-login-password')),
      'WrongPassword123',
    );
    await tap(t, 'driver-login-submit');
    expect(store.token, isNull);
    expect(find.byKey(const Key('driver-login-error')), findsOneWidget);
  });
  testWidgets(
    'recovery requests OTP only after explicit request and checks password confirmation',
    (t) async {
      final service = Service(), store = Store();
      String? token;
      await t.pumpWidget(
        MaterialApp(
          home: DriverPasswordLoginScreen(
            phoneService: service,
            passwordService: service,
            tokenStore: store,
            onAuthenticated: (value) => token = value,
          ),
        ),
      );
      await t.enterText(
        find.byKey(const Key('driver-login-identifier')),
        'driver.name',
      );
      await tap(t, 'driver-forgot-password');
      expect(service.resetCalls, 0);
      await tap(t, 'driver-login-submit');
      expect(service.resetCalls, 1);
      expect(store.token, isNull);
      await t.enterText(find.byKey(const Key('driver-reset-code')), '654321');
      await t.enterText(
        find.byKey(const Key('driver-login-password')),
        'NewPassword123',
      );
      await t.enterText(
        find.byKey(const Key('driver-reset-confirm')),
        'Different12345',
      );
      await tap(t, 'driver-login-submit');
      expect(token, isNull);
      expect(find.text('As senhas não são iguais.'), findsOneWidget);
      await t.enterText(
        find.byKey(const Key('driver-reset-confirm')),
        'NewPassword123',
      );
      await tap(t, 'driver-login-submit');
      expect(token, isNotNull);
    },
  );
  testWidgets(
    'authenticated existing driver creates credentials without another OTP',
    (t) async {
      final service = Service();
      var finished = false;
      await t.pumpWidget(
        MaterialApp(
          home: DriverPasswordSetupScreen(
            service: service,
            accessToken: service.session.accessToken,
            onConfigured: () => finished = true,
          ),
        ),
      );
      await t.pumpAndSettle();
      await t.enterText(
        find.byKey(const Key('driver-setup-username')),
        'driver.name',
      );
      await t.enterText(
        find.byKey(const Key('driver-setup-email')),
        'driver@example.com',
      );
      await t.enterText(
        find.byKey(const Key('driver-setup-password')),
        'Example12345',
      );
      await t.enterText(
        find.byKey(const Key('driver-setup-confirm')),
        'Example12345',
      );
      await tap(t, 'driver-setup-save');
      expect(finished, true);
      expect(service.enrollCalls, 1);
      expect(service.otpCalls, 0);
    },
  );
  testWidgets('configured credentials cannot be overwritten by enrollment UI', (
    t,
  ) async {
    final service = Service()..configured = true;
    await t.pumpWidget(
      MaterialApp(
        home: DriverPasswordSetupScreen(
          service: service,
          accessToken: service.session.accessToken,
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(find.text('Seu acesso está configurado'), findsOneWidget);
    expect(find.byKey(const Key('driver-setup-save')), findsNothing);
    expect(service.enrollCalls, 0);
  });
}
