import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/profile/data/passenger_privacy_service.dart';
import 'package:ramo_nessa_passenger/src/features/profile/presentation/passenger_privacy_screen.dart';

void main() {
  testWidgets('passageiro consulta preferências e envia solicitação LGPD',
      (tester) async {
    final service = _FakePassengerPrivacyService();

    await tester.pumpWidget(
      MaterialApp(home: PassengerPrivacyScreen(service: service)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Política de Privacidade'), findsOneWidget);
    expect(find.text('Acesso aos meus dados'), findsOneWidget);
    expect(
      find.byKey(const Key('privacy-marketing-switch')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const Key('privacy-marketing-switch')),
    );
    await tester.pumpAndSettle();
    expect(service.marketingEnabled, isTrue);

    final note = find.byKey(const Key('privacy-request-note'));
    await tester.scrollUntilVisible(
      note,
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(note, 'Quero uma cópia dos meus dados.');

    final submit = find.byKey(const Key('privacy-request-submit'));
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
    expect(
      tester.widget<FilledButton>(
        find.byKey(const Key('privacy-request-submit')),
      ).onPressed,
      isNotNull,
    );
  });

  testWidgets('documento vigente registra aceite pela versão do Core',
      (tester) async {
    final service = _FakePassengerPrivacyService();

    await tester.pumpWidget(
      MaterialApp(home: PassengerPrivacyScreen(service: service)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Política de Privacidade'));
    await tester.pumpAndSettle();

    final accept = find.byKey(
      const Key('privacy-accept-privacy_policy'),
    );
    await tester.scrollUntilVisible(
      accept,
      160,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(accept);
    await tester.pumpAndSettle();

    expect(service.acceptedDocumentType, 'privacy_policy');
    expect(service.acceptedVersion, 1);
    expect(find.text('Versão aceita'), findsOneWidget);
  });
}

class _FakePassengerPrivacyService implements PassengerPrivacyService {
  bool marketingEnabled = false;
  String? acceptedDocumentType;
  int? acceptedVersion;
  final List<PassengerPrivacyRequest> requests = [];

  @override
  Future<PassengerPrivacyOverview> overview() async {
    return PassengerPrivacyOverview(
      legalDocuments: [
        PassengerLegalDocument(
          documentType: 'privacy_policy',
          version: 1,
          title: 'Política de Privacidade',
          content:
              'Documento jurídico publicado pelo Core para validar a tela do passageiro.',
          effectiveAt: DateTime.utc(2026, 9, 28),
          accepted: acceptedDocumentType == 'privacy_policy' &&
              acceptedVersion == 1,
          acceptedAt: acceptedDocumentType == null
              ? null
              : DateTime.utc(2026, 9, 28, 12),
        ),
      ],
      preferences: PassengerPrivacyPreferences(
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
  Future<PassengerPrivacyRequest> createRequest({
    required String requestType,
    String? note,
  }) async {
    final request = PassengerPrivacyRequest(
      id: 'privacy-request-test',
      requestType: requestType,
      status: 'open',
      note: note,
      createdAt: DateTime.utc(2026, 9, 28, 13),
      updatedAt: DateTime.utc(2026, 9, 28, 13),
    );
    requests.add(request);
    return request;
  }

  @override
  Future<PassengerPrivacyPreferences> updateMarketingNotifications(
    bool enabled,
  ) async {
    marketingEnabled = enabled;
    return PassengerPrivacyPreferences(
      marketingNotificationsEnabled: enabled,
      updatedAt: DateTime.utc(2026, 9, 28, 12, 30),
    );
  }
}
