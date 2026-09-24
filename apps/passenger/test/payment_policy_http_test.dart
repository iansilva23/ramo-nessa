import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/http_passenger_payment_service.dart';

void main() {
  test('política de pagamentos controla disponibilidade de dinheiro', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'cashEnabled': false,
          'paymentRequiredBeforeDispatch': true,
          'passengerWalletEnabled': true,
          'allowedMethods': ['pix', 'card', 'wallet'],
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = HttpPassengerPaymentService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'passenger-policy-token-abcdefghijklmnopqrstuvwxyz',
      client: client,
    );

    final policy = await service.paymentPolicy();

    expect(captured.method, 'GET');
    expect(captured.url.path, '/v1/payments/policy');
    expect(captured.url.toString().contains('passenger-policy-token'), isFalse);
    expect(
      captured.headers['authorization'],
      'Bearer passenger-policy-token-abcdefghijklmnopqrstuvwxyz',
    );
    expect(policy.cashEnabled, isFalse);
    expect(policy.cashAvailable, isFalse);
    expect(policy.allowedMethods, containsAll(['pix', 'card', 'wallet']));
    expect(policy.allowedMethods, isNot(contains('cash')));
  });

  test('autorização cash usa a rota de pagamentos e body cash', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'authorization': {
            'method': 'cash',
            'status': 'authorized',
            'amountCents': 4500,
          },
          'ride': {
            'id': 'ride-cash-http',
            'state': 'SEARCHING_DRIVER',
          },
          'dispatchStatus': 'SEARCHING_DRIVER',
          'duplicateAuthorization': false,
          'cashPolicy': {
            'effectiveDebtLimitCents': 12000,
            'currentDebtCents': 0,
            'projectedDebtCents': 450,
          },
        }),
        201,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = HttpPassengerPaymentService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'passenger-cash-token-abcdefghijklmnopqrstuvwxyz',
      client: client,
    );

    final result = await service.authorizeCashRide(
      rideId: 'ride-cash-http',
    );

    expect(captured.method, 'POST');
    expect(captured.url.path, '/v1/rides/ride-cash-http/payments');
    expect(captured.url.toString().contains('passenger-cash-token'), isFalse);
    expect(
      captured.headers['authorization'],
      'Bearer passenger-cash-token-abcdefghijklmnopqrstuvwxyz',
    );
    expect(jsonDecode(captured.body), {'method': 'cash'});
    expect(result.authorized, isTrue);
    expect(result.amountCents, 4500);
    expect(result.dispatchStatus, 'SEARCHING_DRIVER');
    expect(result.duplicateAuthorization, isFalse);
  });
}
