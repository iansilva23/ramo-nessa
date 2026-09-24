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
      idempotencyKey: 'cash-http-idempotency-key',
    );

    expect(captured.method, 'POST');
    expect(captured.url.path, '/v1/rides/ride-cash-http/payments');
    expect(captured.url.toString().contains('passenger-cash-token'), isFalse);
    expect(
      captured.headers['authorization'],
      'Bearer passenger-cash-token-abcdefghijklmnopqrstuvwxyz',
    );
    expect(
      captured.headers['idempotency-key'],
      'cash-http-idempotency-key',
    );
    expect(jsonDecode(captured.body), {'method': 'cash'});
    expect(result.authorized, isTrue);
    expect(result.amountCents, 4500);
    expect(result.dispatchStatus, 'SEARCHING_DRIVER');
    expect(result.duplicateAuthorization, isFalse);
  });

  test('criação Pix usa Orders pelo Core e retorna QR/copia e cola', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'payment': {
            'id': 'payment-pix-http',
            'status': 'pending',
          },
          'pix': {
            'orderId': 'ORD01PIXHTTP123456789',
            'paymentId': 'PAY01PIXHTTP123456789',
            'status': 'created',
            'statusDetail': 'waiting_payment',
            'ticketUrl': 'https://example.test/pix',
            'qrCode': '000201010212-test-pix',
            'qrCodeBase64': '',
          },
          'simulated': false,
          'actionable': true,
        }),
        201,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = HttpPassengerPaymentService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'passenger-pix-token-abcdefghijklmnopqrstuvwxyz',
      client: client,
    );

    final result = await service.createPixRidePayment(
      rideId: 'ride-pix-http',
      idempotencyKey: 'pix-http-idempotency-key',
      payerEmail: 'passageiro@example.com',
    );

    expect(captured.method, 'POST');
    expect(captured.url.path, '/v1/rides/ride-pix-http/payments');
    expect(
      captured.headers['authorization'],
      'Bearer passenger-pix-token-abcdefghijklmnopqrstuvwxyz',
    );
    expect(
      captured.headers['idempotency-key'],
      'pix-http-idempotency-key',
    );
    expect(jsonDecode(captured.body), {
      'method': 'pix',
      'payerEmail': 'passageiro@example.com',
    });
    expect(result.internalPaymentStatus, 'pending');
    expect(result.orderId, 'ORD01PIXHTTP123456789');
    expect(result.qrCode, '000201010212-test-pix');
  });

  test('cartão envia somente token PCI e metadados necessários ao Core', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'payment': {
            'id': 'payment-card-http',
            'status': 'pending',
          },
          'card': {
            'orderId': 'ORD01CARDHTTP123456789',
            'paymentId': 'PAY01CARDHTTP123456789',
            'status': 'action_required',
            'statusDetail': 'pending_challenge',
            'challengeUrl': 'https://secure.example.test/challenge',
          },
          'ride': {
            'id': 'ride-card-http',
            'state': 'AWAITING_PAYMENT',
          },
          'paymentConfirmed': false,
          'simulated': false,
          'actionable': true,
        }),
        201,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = HttpPassengerPaymentService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'passenger-card-token-abcdefghijklmnopqrstuvwxyz',
      client: client,
    );

    final result = await service.createCardRidePayment(
      rideId: 'ride-card-http',
      idempotencyKey: 'card-http-idempotency-key',
      payerEmail: 'passageiro@example.com',
      cardToken: 'secure-token-' + 'x' * 40,
      paymentMethodId: 'master',
      paymentMethodType: 'credit_card',
    );

    final body = jsonDecode(captured.body) as Map<String, dynamic>;
    expect(captured.url.path, '/v1/rides/ride-card-http/payments');
    expect(body['method'], 'card');
    expect(body['payerEmail'], 'passageiro@example.com');
    expect(body['paymentMethodId'], 'master');
    expect(body['paymentMethodType'], 'credit_card');
    expect(body['installments'], 1);
    expect(body.containsKey('cardNumber'), isFalse);
    expect(body.containsKey('cvv'), isFalse);
    expect(result.status, 'action_required');
    expect(result.challengeUrl, 'https://secure.example.test/challenge');
  });


}
