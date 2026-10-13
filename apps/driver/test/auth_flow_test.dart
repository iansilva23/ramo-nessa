import 'dart:async';

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
    this.invalidCurrentSession = false,
    this.throwCurrentSession = false,
  });

  final String subjectType;
  bool invalidCurrentSession;
  bool throwCurrentSession;
  String? requestedPhone;
  int logoutCalls = 0;
  int sessionChecks = 0;
  Completer<AuthSessionInfo?>? pendingCurrentSession;
  DateTime? currentExpiresAt;
  String? currentSubjectType;
  Completer<void>? pendingLogout;
  bool throwLogout = false;

  @override
  Future<RequestedOtp> requestOtp({
    required String phone,
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
  Future<AuthSessionInfo?> currentSession(String accessToken) async {
    sessionChecks += 1;
    final pending = pendingCurrentSession;
    if (pending != null) return pending.future;
    if (throwCurrentSession) {
      throw StateError('core offline');
    }
    if (invalidCurrentSession) return null;
    return AuthSessionInfo(
      expiresAt: currentExpiresAt ?? DateTime.now().add(const Duration(days: 1)),
      subjectId: 'subject-auth-test',
      subjectType: currentSubjectType ?? subjectType,
    );
  }

  @override
  Future<void> logout(String accessToken) async {
    logoutCalls += 1;
    if (throwLogout) throw StateError('Core offline');
    final pending = pendingLogout;
    if (pending != null) await pending.future;
  }
}

void main() {
  testWidgets('restores cold session and renews on resume without another login', (tester) async {
    final store=_MemoryTokenStore()..token='abcdefghijklmnopqrstuvwxyz123456';
    final service=_FakeAuthService(subjectType:'driver');
    await tester.pumpWidget(MaterialApp(home:MobileAuthGate(
      subjectType:'driver',service:service,tokenStore:store,initialAccessToken:store.token,
      devBypass:false,loginTitle:'Entrar',loginSubtitle:'WhatsApp',
      authenticatedBuilder:(token,logout)=>const Text('SESSION RESTORED'))));
    await tester.pumpAndSettle();
    expect(find.text('SESSION RESTORED'),findsOneWidget);
    expect(service.sessionChecks,1);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(service.sessionChecks,2);
    expect(store.cleared,false);
    expect(find.text('SESSION RESTORED'),findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

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
    // The successful login intentionally leaves the button spinner active until
    // the parent auth gate replaces this screen. This isolated widget test does
    // not replace the screen, so pumpAndSettle would wait forever. Pump a fixed
    // number of frames to flush the async verify + secure-store callback instead.
    await tester.pump();
    await tester.pump();

    expect(store.token, 'abcdefghijklmnopqrstuvwxyz123456');
    expect(authenticatedToken, 'abcdefghijklmnopqrstuvwxyz123456');
  });

  testWidgets('token inválido é apagado e volta ao login', (tester) async {
    var ended = 0;
    final store = _MemoryTokenStore()
      ..token = 'abcdefghijklmnopqrstuvwxyz123456';
    final service = _FakeAuthService(
      subjectType: 'driver',
      invalidCurrentSession: true,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MobileAuthGate(
          subjectType: 'driver',
          service: service,
          tokenStore: store,
          initialAccessToken: store.token,
          devBypass: false,
          onSessionEnded: () async { ended++; throw StateError('push cleanup offline'); },
          loginTitle: 'Entrar',
          loginSubtitle: 'Use seu celular',
          authenticatedBuilder: (token, logout) =>
              const Text('HOME AUTH'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(store.cleared, isTrue);
    expect(ended, 1);
    expect(find.byKey(const Key('auth-phone-field')), findsOneWidget);
    expect(find.text('HOME AUTH'), findsNothing);
  });

  testWidgets(
    'falha temporária do Core não apaga sessão salva',
    (tester) async {
      final store = _MemoryTokenStore()
        ..token = 'abcdefghijklmnopqrstuvwxyz123456';
      final service = _FakeAuthService(
        subjectType: 'driver',
        throwCurrentSession: true,
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
                const Text('HOME OFFLINE'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(store.cleared, isFalse);
      expect(store.token, 'abcdefghijklmnopqrstuvwxyz123456');
      expect(find.text('HOME OFFLINE'), findsOneWidget);
      expect(find.byKey(const Key('auth-phone-field')), findsNothing);
    },
  );

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

  testWidgets('revoked logout returns to login while push cleanup is pending', (tester) async {
    final store = _MemoryTokenStore()..token = 'abcdefghijklmnopqrstuvwxyz123456';
    final service = _FakeAuthService(subjectType: 'driver');
    final cleanup = Completer<void>();
    Future<bool>? result;
    var ended = 0;
    await tester.pumpWidget(MaterialApp(home: MobileAuthGate(
      subjectType: 'driver', service: service, tokenStore: store,
      initialAccessToken: store.token, devBypass: false,
      loginTitle: 'Entrar', loginSubtitle: 'WhatsApp',
      onSessionEnded: () { ended++; return cleanup.future; },
      authenticatedBuilder: (token, logout) => TextButton(
        key: const Key('pending-logout'),
        onPressed: () { result = logout(); }, child: const Text('Sair'),
      ),
    )));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pending-logout')));
    await tester.pumpAndSettle();
    expect(await result, true);
    expect(ended, 1);
    expect(store.cleared, true);
    expect(find.byKey(const Key('auth-phone-field')), findsOneWidget);
    cleanup.completeError(StateError('late push failure'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('duplicate logout and resume do not restart a revoking session', (tester) async {
    final store = _MemoryTokenStore()..token = 'abcdefghijklmnopqrstuvwxyz123456';
    final pending = Completer<void>();
    final service = _FakeAuthService(subjectType: 'driver')..pendingLogout = pending;
    Future<bool>? first;
    Future<bool>? second;
    var taps = 0;
    await tester.pumpWidget(MaterialApp(home: MobileAuthGate(
      subjectType: 'driver', service: service, tokenStore: store,
      initialAccessToken: store.token, devBypass: false,
      loginTitle: 'Entrar', loginSubtitle: 'WhatsApp',
      authenticatedBuilder: (token, logout) => TextButton(
        key: const Key('duplicate-logout'),
        onPressed: () { if (taps++ == 0) { first = logout(); } else { second = logout(); } },
        child: const Text('Sair'),
      ),
    )));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('duplicate-logout')));
    await tester.tap(find.byKey(const Key('duplicate-logout')));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(await second, false);
    expect(service.logoutCalls, 1);
    expect(service.sessionChecks, 1);
    expect(store.cleared, false);
    pending.complete();
    await tester.pumpAndSettle();
    expect(await first, true);
    expect(find.byKey(const Key('auth-phone-field')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('failed Core logout preserves session and permits retry', (tester) async {
    final store = _MemoryTokenStore()..token = 'abcdefghijklmnopqrstuvwxyz123456';
    final service = _FakeAuthService(subjectType: 'driver')..throwLogout = true;
    Future<bool>? result;
    var ended = 0;
    await tester.pumpWidget(MaterialApp(home: MobileAuthGate(
      subjectType: 'driver', service: service, tokenStore: store,
      initialAccessToken: store.token, devBypass: false,
      loginTitle: 'Entrar', loginSubtitle: 'WhatsApp',
      onSessionEnded: () async { ended++; },
      authenticatedBuilder: (token, logout) => TextButton(
        key: const Key('retry-logout'),
        onPressed: () { result = logout(); }, child: const Text('Sair'),
      ),
    )));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('retry-logout')));
    await tester.pumpAndSettle();
    expect(await result, false);
    expect(store.cleared, false);
    expect(ended, 0);
    expect(find.byKey(const Key('retry-logout')), findsOneWidget);
    service.throwLogout = false;
    await tester.tap(find.byKey(const Key('retry-logout')));
    await tester.pumpAndSettle();
    expect(await result, true);
    expect(service.logoutCalls, 2);
    expect(ended, 1);
    expect(find.byKey(const Key('auth-phone-field')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });


  testWidgets('synchronous optional push failures do not block login or logout', (tester) async {
    final store = _MemoryTokenStore()..token = 'abcdefghijklmnopqrstuvwxyz123456';
    final service = _FakeAuthService(subjectType: 'driver');
    var ended = 0;
    await tester.pumpWidget(MaterialApp(home: MobileAuthGate(
      subjectType: 'driver', service: service, tokenStore: store,
      initialAccessToken: store.token, devBypass: false,
      loginTitle: 'Entrar', loginSubtitle: 'WhatsApp',
      onSessionReady: (_) => throw StateError('push registration failure'),
      onSessionEnded: () { ended++; throw StateError('push cleanup failure'); },
      authenticatedBuilder: (token, logout) => TextButton(
        key: const Key('sync-failure-logout'),
        onPressed: () async { await logout(); }, child: const Text('Sair'),
      ),
    )));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('sync-failure-logout')), findsOneWidget);
    await tester.tap(find.byKey(const Key('sync-failure-logout')));
    await tester.pumpAndSettle();
    expect(ended, 1);
    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('auth-phone-field')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('foreground Web checks revoke session without registering push again', (tester) async {
    final store = _MemoryTokenStore()..token = 'abcdefghijklmnopqrstuvwxyz123456';
    final service = _FakeAuthService(subjectType: 'driver');
    var ready = 0;
    var ended = 0;
    await tester.pumpWidget(MaterialApp(home: MobileAuthGate(
      subjectType: 'driver', service: service, tokenStore: store,
      initialAccessToken: store.token, devBypass: false,
      sessionValidationInterval: const Duration(minutes: 1),
      loginTitle: 'Entrar', loginSubtitle: 'WhatsApp',
      onSessionReady: (_) async { ready++; },
      onSessionEnded: () async { ended++; },
      authenticatedBuilder: (_, logout) => const Text('WEB SESSION'),
    )));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 61));
    await tester.pumpAndSettle();
    expect(service.sessionChecks, 2);
    expect(ready, 1);
    service.invalidCurrentSession = true;
    await tester.pump(const Duration(seconds: 60));
    await tester.pumpAndSettle();
    expect(store.cleared, true);
    expect(ended, 1);
    expect(find.byKey(const Key('auth-phone-field')), findsOneWidget);
    await tester.pump(const Duration(minutes: 2));
    expect(service.sessionChecks, 3);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('temporary periodic failure keeps session and next check can revoke it', (tester) async {
    final store = _MemoryTokenStore()..token = 'abcdefghijklmnopqrstuvwxyz123456';
    final service = _FakeAuthService(subjectType: 'driver');
    await tester.pumpWidget(MaterialApp(home: MobileAuthGate(
      subjectType: 'driver', service: service, tokenStore: store,
      initialAccessToken: store.token, devBypass: false,
      sessionValidationInterval: const Duration(minutes: 1),
      loginTitle: 'Entrar', loginSubtitle: 'WhatsApp',
      authenticatedBuilder: (_, logout) => const Text('WEB OFFLINE'),
    )));
    await tester.pumpAndSettle();
    service.throwCurrentSession = true;
    await tester.pump(const Duration(seconds: 61));
    await tester.pumpAndSettle();
    expect(store.cleared, false);
    expect(find.text('WEB OFFLINE'), findsOneWidget);
    service.throwCurrentSession = false;
    service.invalidCurrentSession = true;
    await tester.pump(const Duration(seconds: 60));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('auth-phone-field')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('hidden Web stops periodic checks and resume validates immediately', (tester) async {
    final store = _MemoryTokenStore()..token = 'abcdefghijklmnopqrstuvwxyz123456';
    final service = _FakeAuthService(subjectType: 'driver');
    await tester.pumpWidget(MaterialApp(home: MobileAuthGate(
      subjectType: 'driver', service: service, tokenStore: store,
      initialAccessToken: store.token, devBypass: false,
      sessionValidationInterval: const Duration(minutes: 1),
      loginTitle: 'Entrar', loginSubtitle: 'WhatsApp',
      authenticatedBuilder: (_, logout) => const Text('WEB HIDDEN'),
    )));
    await tester.pumpAndSettle();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(const Duration(minutes: 3));
    expect(service.sessionChecks, 1);
    service.invalidCurrentSession = true;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(service.sessionChecks, 2);
    expect(find.byKey(const Key('auth-phone-field')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('periodic checks do not overlap and dispose cancels timer', (tester) async {
    final store = _MemoryTokenStore()..token = 'abcdefghijklmnopqrstuvwxyz123456';
    final service = _FakeAuthService(subjectType: 'driver');
    await tester.pumpWidget(MaterialApp(home: MobileAuthGate(
      subjectType: 'driver', service: service, tokenStore: store,
      initialAccessToken: store.token, devBypass: false,
      sessionValidationInterval: const Duration(minutes: 1),
      loginTitle: 'Entrar', loginSubtitle: 'WhatsApp',
      authenticatedBuilder: (_, logout) => const Text('WEB PENDING'),
    )));
    await tester.pumpAndSettle();
    final pending = Completer<AuthSessionInfo?>();
    service.pendingCurrentSession = pending;
    await tester.pump(const Duration(seconds: 61));
    await tester.pump(const Duration(minutes: 2));
    expect(service.sessionChecks, 2);
    await tester.pumpWidget(const SizedBox());
    pending.complete(null);
    await tester.pump(const Duration(minutes: 2));
    expect(service.sessionChecks, 2);
    expect(store.cleared, false);
    expect(tester.takeException(), isNull);
  });

  testWidgets('native default does not add periodic session traffic', (tester) async {
    final store = _MemoryTokenStore()..token = 'abcdefghijklmnopqrstuvwxyz123456';
    final service = _FakeAuthService(subjectType: 'driver');
    await tester.pumpWidget(MaterialApp(home: MobileAuthGate(
      subjectType: 'driver', service: service, tokenStore: store,
      initialAccessToken: store.token, devBypass: false,
      loginTitle: 'Entrar', loginSubtitle: 'WhatsApp',
      authenticatedBuilder: (_, logout) => const Text('NATIVE SESSION'),
    )));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(minutes: 3));
    expect(service.sessionChecks, 1);
    await tester.pumpWidget(const SizedBox());
  });

  for (final invalidReason in ['expired', 'wrong-role']) {
    testWidgets('periodic validation rejects $invalidReason session', (tester) async {
      final store = _MemoryTokenStore()..token = 'abcdefghijklmnopqrstuvwxyz123456';
      final service = _FakeAuthService(subjectType: 'driver');
      await tester.pumpWidget(MaterialApp(home: MobileAuthGate(
        subjectType: 'driver', service: service, tokenStore: store,
        initialAccessToken: store.token, devBypass: false,
        sessionValidationInterval: const Duration(minutes: 1),
        loginTitle: 'Entrar', loginSubtitle: 'WhatsApp',
        authenticatedBuilder: (_, logout) => const Text('VALID SESSION'),
      )));
      await tester.pumpAndSettle();
      if (invalidReason == 'expired') {
        service.currentExpiresAt = DateTime.now().subtract(const Duration(seconds: 1));
      } else {
        service.currentSubjectType = 'passenger';
      }
      await tester.pump(const Duration(seconds: 61));
      await tester.pumpAndSettle();
      expect(store.cleared, true);
      expect(find.byKey(const Key('auth-phone-field')), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
