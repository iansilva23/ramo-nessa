import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/core/auth/auth_token_store.dart';
import 'package:ramo_nessa_passenger/src/core/auth/mobile_auth_gate.dart';
import 'package:ramo_nessa_passenger/src/core/auth/phone_auth_service.dart';
import 'package:ramo_nessa_passenger/src/core/auth/phone_login_screen.dart';

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
    this.invalidCurrentSession = false,
    this.throwCurrentSession = false,
  });

  final String subjectType;
  final bool invalidCurrentSession;
  final bool throwCurrentSession;
  String? requestedPhone;
  int logoutCalls = 0;

  @override
  Future<RequestedOtp> requestOtp({
    required String phone,
    String? email,
  }) async {
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
  Future<RequestedOtp> requestPasswordResetOtp({
    required String phone,
  }) =>
      requestOtp(phone: phone);

  @override
  Future<AuthSession> loginWithPassword({
    required String email,
    required String password,
  }) async {
    return AuthSession(
      accessToken: 'abcdefghijklmnopqrstuvwxyz123456',
      expiresAt: DateTime(2026, 10, 23),
      subjectId: 'subject-auth-test',
      subjectType: subjectType,
    );
  }

  @override
  Future<PassengerAccount> passengerAccount(String accessToken) async {
    return const PassengerAccount(
      subjectId: 'subject-auth-test',
      phoneE164: '+5588999991234',
      email: 'passageiro@example.com',
      fullName: 'Passageiro Teste',
    );
  }

  @override
  Future<PassengerAccount> updatePassengerAccount({
    required String accessToken,
    String? fullName,
    String? email,
    String? password,
  }) async {
    return PassengerAccount(
      subjectId: 'subject-auth-test',
      phoneE164: '+5588999991234',
      email: email ?? 'passageiro@example.com',
      fullName: fullName ?? 'Passageiro Teste',
    );
  }

  @override
  Future<PassengerAccount> updatePassengerPhoto({
    required String accessToken,
    required Uint8List bytes,
    required String mimeType,
  }) async {
    return const PassengerAccount(
      subjectId: 'subject-auth-test',
      phoneE164: '+5588999991234',
      email: 'passageiro@example.com',
      fullName: 'Passageiro Teste',
      photoUrl: 'https://core.test/v1/passenger/me/photo?v=1',
    );
  }

  @override
  Future<AuthSessionInfo?> currentSession(String accessToken) async {
    if (throwCurrentSession) {
      throw StateError('core offline');
    }
    if (invalidCurrentSession) return null;
    return AuthSessionInfo(
      expiresAt: DateTime.now().add(const Duration(days: 1)),
      subjectId: 'subject-auth-test',
      subjectType: subjectType,
    );
  }

  @override
  Future<AuthSecuritySession> securitySession(String accessToken) async {
    return AuthSecuritySession(
      id: 'session-auth-test',
      subjectType: subjectType,
      createdAt: DateTime(2026, 9, 23, 12),
      expiresAt: DateTime(2026, 10, 23, 12),
    );
  }

  @override
  Future<RevokeOtherSessionsResult> revokeOtherSessions(
    String accessToken,
  ) async {
    return const RevokeOtherSessionsResult(
      revokedSessions: 0,
      disabledDevices: 0,
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
    final service = _FakeAuthService(subjectType: 'passenger');
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
    // The successful login intentionally leaves the button spinner active until
    // the parent auth gate replaces this screen. This isolated widget test does
    // not replace the screen, so pumpAndSettle would wait forever. Pump a fixed
    // number of frames to flush the async verify + secure-store callback instead.
    await tester.pump();
    await tester.pump();

    expect(store.token, 'abcdefghijklmnopqrstuvwxyz123456');
    expect(authenticatedToken, 'abcdefghijklmnopqrstuvwxyz123456');
  });

  testWidgets('token inválido é apagado e volta à entrada da conta', (tester) async {
    final store = _MemoryTokenStore()
      ..token = 'abcdefghijklmnopqrstuvwxyz123456';
    final service = _FakeAuthService(
      subjectType: 'passenger',
      invalidCurrentSession: true,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MobileAuthGate(
          subjectType: 'passenger',
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
    expect(find.byKey(const Key('auth-login-button')), findsOneWidget);
    expect(
      find.byKey(const Key('auth-create-account-button')),
      findsOneWidget,
    );
    expect(find.text('HOME AUTH'), findsNothing);
  });

  testWidgets(
    'falha temporária do Core não apaga sessão salva',
    (tester) async {
      final store = _MemoryTokenStore()
        ..token = 'abcdefghijklmnopqrstuvwxyz123456';
      final service = _FakeAuthService(
        subjectType: 'passenger',
        throwCurrentSession: true,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: MobileAuthGate(
            subjectType: 'passenger',
            service: service,
            tokenStore: store,
            initialAccessToken: store.token,
            devBypass: false,
            loginTitle: 'Entrar',
            loginSubtitle: 'Use seu celular',
            authenticatedBuilder: (token, logout) =>
                const Text('HOME OFFLINE'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(store.cleared, isFalse);
      expect(store.token, 'abcdefghijklmnopqrstuvwxyz123456');
      expect(find.text('HOME OFFLINE'), findsOneWidget);
      expect(find.byKey(const Key('auth-login-button')), findsNothing);
    },
  );

  testWidgets('logout revoga servidor antes de apagar sessão', (tester) async {
    final store = _MemoryTokenStore()
      ..token = 'abcdefghijklmnopqrstuvwxyz123456';
    final service = _FakeAuthService(subjectType: 'passenger');

    await tester.pumpWidget(
      MaterialApp(
        home: MobileAuthGate(
          subjectType: 'passenger',
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
    expect(find.byKey(const Key('auth-login-button')), findsOneWidget);
  });
}
