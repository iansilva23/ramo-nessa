import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/http_passenger_payment_service.dart';

void main() {
  test('Bearer tem prioridade sobre identidade dev no Passageiro', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response('{"balanceCents":1234}', 200);
    });

    final service = HttpPassengerPaymentService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'abcdefghijklmnopqrstuvwxyz123456',
      passengerId: 'passenger-dev',
      client: client,
    );

    expect(await service.walletBalanceCents(), 1234);
    expect(
      captured.headers['authorization'],
      'Bearer abcdefghijklmnopqrstuvwxyz123456',
    );
    expect(captured.headers.containsKey('x-dev-passenger-id'), isFalse);
  });

  test('cash usa política do Core, Bearer e Idempotency-Key', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      if (request.url.path == '/v1/payments/policy') {
        return http.Response(
          '{"cashEnabled":true,"allowedMethods":["pix","card","wallet","cash"],'
          '"paymentRequiredBeforeDispatch":true,"passengerWalletEnabled":true}',
          200,
        );
      }
      return http.Response(
        '{"authorization":{"method":"cash","status":"authorized","amountCents":4500},'
        '"ride":{"state":"SEARCHING_DRIVER"},'
        '"dispatchStatus":"SEARCHING_DRIVER","duplicateAuthorization":false}',
        201,
      );
    });

    final service = HttpPassengerPaymentService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'abcdefghijklmnopqrstuvwxyz123456',
      passengerId: 'passenger-dev',
      client: client,
    );

    final policy = await service.paymentPolicy();
    expect(policy.cashAvailable, isTrue);

    final result = await service.authorizeCashRide(
      rideId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      idempotencyKey: 'cash-test-idempotency-key',
    );
    expect(result.authorized, isTrue);
    expect(result.amountCents, 4500);

    expect(requests.length, 2);
    expect(requests[0].url.path, '/v1/payments/policy');
    expect(
      requests[0].headers['authorization'],
      'Bearer abcdefghijklmnopqrstuvwxyz123456',
    );
    expect(
      requests[1].url.path,
      '/v1/rides/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/payments',
    );
    expect(
      requests[1].headers['authorization'],
      'Bearer abcdefghijklmnopqrstuvwxyz123456',
    );
    expect(
      requests[1].headers['idempotency-key'],
      'cash-test-idempotency-key',
    );
    expect(requests[1].body, '{"method":"cash"}');
    expect(requests[1].headers.containsKey('x-dev-passenger-id'), isFalse);
  });

}
