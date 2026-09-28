import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/profile/data/driver_privacy_service.dart';
import 'package:ramo_nessa_driver/src/features/profile/presentation/driver_privacy_screen.dart';

void main() {
  testWidgets('motorista altera preferência e envia solicitação LGPD',
      (tester) async {
    final service = _FakeDriverPrivacyService();

    await tester.pumpWidget(
      MaterialApp(home: DriverPrivacyScreen(service: service)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Termos de Uso'), findsOneWidget);
    expect(
      find.byKey(const Key('driver-privacy-marketing-switch')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const Key('driver-privacy-marketing-switch')),
    );
    await tester.pumpAndSettle();
    expect(service.marketingEnabled, isTrue);

    final note = find.byKey(const Key('driver-privacy-request-note'));
    await tester.scrollUntilVisible(
      note,
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(note, 'Quero consultar meus dados.');

    final submit = find.byKey(
      const Key('driver-privacy-request-submit'),
    );
    await tester.scrollUntilVisible(
      submit,
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(submit);
    await tester.pumpAndSettle();

    expect(service.requests, hasLength(1));
    expect(service.requests.single.requestType, 'access');
    expect(
      find.text('Solicitação registrada e enviada para atendimento.'),
      findsOneWidget,
    );
  });

  testWidgets('motorista aceita exatamente a versão publicada pelo Core',
      (tester) async {
    final service = _FakeDriverPrivacyService();

    await tester.pumpWidget(
      MaterialApp(home: DriverPrivacyScreen(service: service)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Termos de Uso'));
    await tester.pumpAndSettle();

    final accept = find.byKey(
      const Key('driver-privacy-accept-terms_of_use'),
    );
    await tester.scrollUntilVisible(
      accept,
      160,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(accept);
    await tester.pumpAndSettle();

    expect(service.acceptedDocumentType, 'terms_of_use');
    expect(service.acceptedVersion, 2);
    expect(find.text('Versão aceita'), findsOneWidget);
  });
}

class _FakeDriverPrivacyService implements DriverPrivacyService {
  bool marketingEnabled = false;
  String? acceptedDocumentType;
  int? acceptedVersion;
  final List<DriverPrivacyRequest> requests = [];

  @override
  Future<DriverPrivacyOverview> overview() async {
    return DriverPrivacyOverview(
      legalDocuments: [
        DriverLegalDocument(
          documentType: 'terms_of_use',
          version: 2,
          title: 'Termos de Uso',
          content:
              'Documento jurídico publicado pelo Core para validar a tela do motorista.',
          effectiveAt: DateTime.utc(2026, 9, 28),
          accepted: acceptedDocumentType == 'terms_of_use' &&
              acceptedVersion == 2,
          acceptedAt: acceptedDocumentType == null
              ? null
              : DateTime.utc(2026, 9, 28, 14),
        ),
      ],
      preferences: DriverPrivacyPreferences(
        marketingNotificationsEnabled: marketingEnabled,
        updatedAt: DateTime.utc(2026, 9, 28),
      ),
      requests: List.unmodifiable(requests),
    );
  }

  @override
  Future<void> acceptLegalDocument({
    required String documentType,
    required int version,
  }) async {
    acceptedDocumentType = documentType;
    acceptedVersion = version;
  }

  @override
  Future<DriverPrivacyRequest> createRequest({
    required String requestType,
    String? note,
  }) async {
    final request = DriverPrivacyRequest(
      id: 'driver-privacy-request-test',
      requestType: requestType,
      status: 'open',
      note: note,
      createdAt: DateTime.utc(2026, 9, 28, 14, 20),
      updatedAt: DateTime.utc(2026, 9, 28, 14, 20),
    );
    requests.add(request);
    return request;
  }

  @override
  Future<DriverPrivacyPreferences> updateMarketingNotifications(
    bool enabled,
  ) async {
    marketingEnabled = enabled;
    return DriverPrivacyPreferences(
      marketingNotificationsEnabled: enabled,
      updatedAt: DateTime.utc(2026, 9, 28, 14, 10),
    );
  }
}
