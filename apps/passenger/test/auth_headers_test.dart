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
}
