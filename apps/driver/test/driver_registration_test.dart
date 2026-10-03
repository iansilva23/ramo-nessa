import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_driver/src/core/auth/http_phone_auth_service.dart';
import 'package:ramo_nessa_driver/src/core/auth/phone_login_screen.dart';
import 'package:ramo_nessa_driver/src/core/auth/auth_token_store.dart';
import 'package:ramo_nessa_driver/src/features/registration/driver_registration_service.dart';
import 'package:ramo_nessa_driver/src/features/registration/driver_registration_gate.dart';
import 'package:ramo_nessa_driver/src/preview/driver_preview_dependencies.dart';

class _Store implements AuthTokenStore {
  @override Future<void> clearAccessToken() async {}
  @override Future<String?> readAccessToken() async => null;
  @override Future<void> saveAccessToken(String token) async {}
}
class _Registration implements DriverRegistrationService {
  Map<String, dynamic> response = {'status': 'pending', 'documentsSubmitted': true, 'documents': []};
  @override Future<Map<String, dynamic>> status() async => response;
  @override Future<Map<String, dynamic>> submit(Map<String, dynamic> data) async => response;
}
void main() {
  testWidgets('Cadastro inicia OTP na rota própria e respeita espera de reenvio', (tester) async {
    tester.view.physicalSize = const Size(1080, 2200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    String? requestedPath;
    final auth = HttpPhoneAuthService(baseUrl: Uri.parse('https://core.example'), subjectType: 'driver', client: MockClient((request) async {
      requestedPath = request.url.path;
      return http.Response('{"challengeId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","expiresAt":"2026-12-01T00:00:00Z","retryAfterSeconds":60}', 202);
    }));
    await tester.pumpWidget(MaterialApp(home: PhoneLoginScreen(service: auth, tokenStore: _Store(), title: 'Entrar', subtitle: 'Motorista',
      onAuthenticated: (_) {}, requestRegistrationOtp: (phone) => auth.requestRegistrationOtp(phone: phone))));
    await tester.tap(find.byKey(const Key('driver-registration-button')));
    await tester.pump();
    await tester.enterText(find.byKey(const Key('auth-phone-field')), '88999991111');
    await tester.tap(find.byKey(const Key('auth-primary-button')));
    await tester.pumpAndSettle();
    expect(requestedPath, '/v1/auth/driver-registration/request');
    expect(find.byKey(const Key('auth-code-field')), findsOneWidget);
    final resend = tester.widget<TextButton>(find.widgetWithText(TextButton, 'Reenviar em 60s'));
    expect(resend.onPressed, isNull);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('cadastro pendente não abre mapa e liberação aparece após atualizar', (tester) async {
    final service = _Registration();
    await tester.pumpWidget(MaterialApp(home: DriverRegistrationGate(service: service, api: DriverPreviewDependencies().api,
      logout: () async => true, homeBuilder: () => const Text('MAPA LIBERADO'))));
    await tester.pumpAndSettle();
    expect(find.text('Seu cadastro está em análise'), findsOneWidget);
    expect(find.text('MAPA LIBERADO'), findsNothing);
    service.response = {'status': 'approved'};
    await tester.ensureVisible(find.text('Atualizar situação'));
    await tester.tap(find.text('Atualizar situação'));
    await tester.pumpAndSettle();
    expect(find.text('MAPA LIBERADO'), findsOneWidget);
  });
  testWidgets('falha de consulta nunca libera mapa e oferece nova tentativa', (tester) async {
    final service = HttpDriverRegistrationService(baseUrl: Uri.parse('https://core.example'), accessToken: 'private-session',
      client: MockClient((request) async => http.Response('{"message":"Servidor indisponível"}', 503)));
    await tester.pumpWidget(MaterialApp(home: DriverRegistrationGate(service: service, api: DriverPreviewDependencies().api,
      logout: () async => true, homeBuilder: () => const Text('MAPA LIBERADO'))));
    await tester.pumpAndSettle();
    expect(find.text('MAPA LIBERADO'), findsNothing);
    expect(find.text('Tentar novamente'), findsOneWidget);
  });
  test('Cadastro usa Bearer e envia somente dados para análise', () async {
    http.Request? captured;
    final service = HttpDriverRegistrationService(baseUrl: Uri.parse('https://core.example'), accessToken: 'private-session',
      client: MockClient((request) async { captured = request; return http.Response('{"status":"pending"}', 201); }));
    expect((await service.submit({'fullName': 'Ian Teste', 'vehicle': {'plate': 'ABC1D23'}}))['status'], 'pending');
    expect(captured!.url.path, '/v1/driver/me/registration');
    expect(captured!.headers['authorization'], 'Bearer private-session');
  });
}
