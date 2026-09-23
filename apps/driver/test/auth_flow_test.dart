import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/core/auth/auth_token_store.dart';
import 'package:ramo_nessa_driver/src/core/auth/mobile_auth_gate.dart';
import 'package:ramo_nessa_driver/src/core/auth/phone_auth_service.dart';
import 'package:ramo_nessa_driver/src/core/auth/phone_login_screen.dart';

class _MemoryTokenStore implements AuthTokenStore {
  String? token;
  bool cleared = false;

  @override
  Future<void> clearAccessToken() async {
    token = null;
    cleared = true;
  }

  @override
  Future<String?> readAccessToken() async => token;

  @override
  Future<void> saveAccessToken(String token) async {
    this.token = token;
  }
}

class _FakeAuthService implements PhoneAuthService {
  _FakeAuthService({
    required this.subjectType,
    this.failCurrentSession = false,
  });

  final String subjectType;
  final bool failCurrentSession;
  String? requestedPhone;
  int logoutCalls = 0;

  @override
  Future<RequestedOtp> requestOtp(String phone) async {
    requestedPhone = phone;
    return RequestedOtp(
      challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expiresAt: DateTime(2026, 9, 23, 12, 0),
      retryAfterSeconds: 60,
      devCode: '123456',
    );
  }

  @override
  Future<AuthSession> verifyOtp({
    required String challengeId,
    required String code,
  }) async {
    expect(challengeId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(code, '123456');
    return AuthSession(
      accessToken: 'abcdefghijklmnopqrstuvwxyz123456',
      expiresAt: DateTime(2026, 10, 23),
      subjectId: 'subject-auth-test',
      subjectType: subjectType,
    );
  }

  @override
  Future<AuthSessionInfo> currentSession(String accessToken) async {
    if (failCurrentSession) {
      throw StateError('invalid session');
    }
    return AuthSessionInfo(
      expiresAt: DateTime.now().add(const Duration(days: 1)),
      subjectId: 'subject-auth-test',
      subjectType: subjectType,
    );
  }

  @override
  Future<void> logout(String accessToken) async {
    logoutCalls += 1;
  }
}

void main() {
  testWidgets('OTP salva a sessão antes de liberar o app', (tester) async {
    final store = _MemoryTokenStore();
    final service = _FakeAuthService(subjectType: 'driver');
    String? authenticatedToken;

    await tester.pumpWidget(
      MaterialApp(
        home: PhoneLoginScreen(
          service: service,
          tokenStore: store,
          title: 'Entrar',
          subtitle: 'Use seu celular',
          onAuthenticated: (token) => authenticatedToken = token,
        ),
      ),
    );

    await tester.enterText(
      find.byKey(const Key('auth-phone-field')),
      '(88) 99999-1234',
    );
    await tester.tap(find.byKey(const Key('auth-primary-button')));
    await tester.pumpAndSettle();

    expect(service.requestedPhone, '(88) 99999-1234');
    expect(find.byKey(const Key('auth-code-field')), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('auth-code-field')),
      '123456',
    );
    await tester.tap(find.byKey(const Key('auth-primary-button')));
    await tester.pumpAndSettle();

    expect(store.token, 'abcdefghijklmnopqrstuvwxyz123456');
    expect(authenticatedToken, 'abcdefghijklmnopqrstuvwxyz123456');
  });

  testWidgets('token inválido é apagado e volta ao login', (tester) async {
    final store = _MemoryTokenStore()
      ..token = 'abcdefghijklmnopqrstuvwxyz123456';
    final service = _FakeAuthService(
      subjectType: 'driver',
      failCurrentSession: true,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MobileAuthGate(
          subjectType: 'driver',
          service: service,
          tokenStore: store,
          initialAccessToken: store.token,
          devBypass: false,
          loginTitle: 'Entrar',
          loginSubtitle: 'Use seu celular',
          authenticatedBuilder: (token, logout) =>
              const Text('HOME AUTH'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(store.cleared, isTrue);
    expect(find.byKey(const Key('auth-phone-field')), findsOneWidget);
    expect(find.text('HOME AUTH'), findsNothing);
  });

  testWidgets('logout revoga servidor antes de apagar sessão', (tester) async {
    final store = _MemoryTokenStore()
      ..token = 'abcdefghijklmnopqrstuvwxyz123456';
    final service = _FakeAuthService(subjectType: 'driver');

    await tester.pumpWidget(
      MaterialApp(
        home: MobileAuthGate(
          subjectType: 'driver',
          service: service,
          tokenStore: store,
          initialAccessToken: store.token,
          devBypass: false,
          loginTitle: 'Entrar',
          loginSubtitle: 'Use seu celular',
          authenticatedBuilder: (token, logout) => Scaffold(
            body: TextButton(
              key: const Key('test-logout'),
              onPressed: () async => logout(),
              child: const Text('Sair'),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('test-logout')));
    await tester.pumpAndSettle();

    expect(service.logoutCalls, 1);
    expect(store.cleared, isTrue);
    expect(find.byKey(const Key('auth-phone-field')), findsOneWidget);
  });
}
