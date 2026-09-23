import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_api.dart';
import 'package:ramo_nessa_driver/src/features/home/data/http_driver_api.dart';

void main() {
  test('Bearer tem prioridade sobre identidade dev no Motorista', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        '{"driverId":"driver-1","vehicleId":"vehicle-1",'
        '"categories":["car"],"fourByFour":false,"seatCapacity":4,'
        '"online":false,"busy":false,'
        '"latitude":-2.82,"longitude":-40.41,'
        '"locationUpdatedAt":"2026-09-23T09:40:00.000Z"}',
        200,
      );
    });

    final api = HttpDriverApi(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'abcdefghijklmnopqrstuvwxyz123456',
      driverId: 'driver-dev',
      client: client,
    );

    await api.getSupply();

    expect(
      captured.headers['authorization'],
      'Bearer abcdefghijklmnopqrstuvwxyz123456',
    );
    expect(captured.headers.containsKey('x-dev-driver-id'), isFalse);
  });

  test('erro do Core preserva código e status para o onboarding', () async {
    final client = MockClient((request) async {
      return http.Response(
        '{"error":"DRIVER_SUPPLY_NOT_INITIALIZED",'
        '"message":"Cadastro aprovado. Ative a localização."}',
        409,
        headers: {'content-type': 'application/json'},
      );
    });

    final api = HttpDriverApi(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      accessToken: 'abcdefghijklmnopqrstuvwxyz123456',
      client: client,
    );

    try {
      await api.getSupply();
      fail('Era esperado DriverApiException.');
    } on DriverApiException catch (error) {
      expect(error.code, 'DRIVER_SUPPLY_NOT_INITIALIZED');
      expect(error.statusCode, 409);
      expect(error.message, contains('Cadastro aprovado'));
    }
  });
}
