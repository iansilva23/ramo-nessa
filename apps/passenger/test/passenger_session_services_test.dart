import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/http_passenger_payment_service.dart';
import 'package:ramo_nessa_passenger/src/features/profile/data/http_passenger_saved_place_service.dart';
import 'package:ramo_nessa_passenger/src/features/profile/data/http_passenger_support_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/http_passenger_activity_service.dart';
import 'package:ramo_nessa_passenger/src/passenger_session_services.dart';
import 'package:ramo_nessa_passenger/src/preview/passenger_preview_dependencies.dart';

void main() {
  final coreUri = Uri.parse('https://core.ramonessa.test');
  const token = 'passenger-session-token-abcdefghijklmnopqrstuvwxyz';

  test('sessão real disponibiliza pagamentos, suporte e perfil pelo Core', () {
    final services = PassengerSessionServices(
      coreUri: coreUri,
      accessToken: token,
    );
    expect(services.payments, isA<HttpPassengerPaymentService>());
    expect(services.support, isA<HttpPassengerSupportService>());
    expect(services.savedPlaces, isA<HttpPassengerSavedPlaceService>());
    expect(services.activity, isA<HttpPassengerActivityService>());
  });

  test('Preview com Core público nunca seleciona endpoints privados', () {
    final preview = PassengerPreviewDependencies();
    final services = PassengerSessionServices(
      coreUri: coreUri,
      accessToken: token,
      preview: preview,
    );
    expect(services.payments, same(preview.payments));
    expect(services.support, same(preview.support));
    expect(services.activity, same(preview.activity));
    expect(services.savedPlaces, isNull);
  });

  test('sem sessão ou Core não cria serviços privados', () {
    for (final services in [
      PassengerSessionServices(coreUri: coreUri, accessToken: null),
      PassengerSessionServices(coreUri: coreUri, accessToken: 'invalid'),
      PassengerSessionServices(coreUri: null, accessToken: token),
    ]) {
      expect(services.payments, isNull);
      expect(services.support, isNull);
      expect(services.activity, isNull);
      expect(services.savedPlaces, isNull);
    }
  });

  test('preserva serviço de pagamento fornecido explicitamente', () {
    final injected = PassengerPreviewDependencies().payments;
    for (final preview in [null, PassengerPreviewDependencies()]) {
      final services = PassengerSessionServices(
        coreUri: coreUri,
        accessToken: token,
        preview: preview,
        paymentService: injected,
      );
      expect(services.payments, same(injected));
    }
  });
}
