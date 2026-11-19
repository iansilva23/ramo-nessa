import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_driver/src/features/home/data/http_driver_api.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_api.dart';

void main() {
  test('idle driver lock uses authenticated driver-wide endpoint', () async {
    final api=HttpDriverApi(
      baseUrl:Uri.parse('https://example.invalid'),accessToken:'test-token',
      client:MockClient((request) async {
        expect(request.method,'POST');
        expect(request.url.path,'/v1/driver/me/screen-lock');
        expect(request.headers['authorization'],'Bearer test-token');
        return http.Response('{"outcome":"OFFLINE"}',200);
      }),
    );
    expect(await api.lockScreen(),'OFFLINE');
  });
  const offerId = '00000000-0000-4000-8000-000000000001';
  test('lock request carries session and preserves accepted outcome', () async {
    final api = HttpDriverApi(
      baseUrl: Uri.parse('https://example.invalid'), accessToken: 'test-token',
      client: MockClient((request) async {
        expect(request.method, 'POST');
        expect(request.url.path, '/v1/driver/me/offers/$offerId/screen-lock');
        expect(request.headers['authorization'], 'Bearer test-token');
        return http.Response('{"outcome":"ACCEPTED"}', 200);
      }),
    );
    expect(await api.lockPendingOffer(offerId), 'ACCEPTED');
  });
  test('unknown response is not interpreted as permission to discard a ride', () async {
    final api = HttpDriverApi(
      baseUrl: Uri.parse('https://example.invalid'),
      client: MockClient((_) async => http.Response('{"outcome":"UNKNOWN"}',200)),
    );
    await expectLater(api.lockPendingOffer(offerId), throwsA(isA<DriverApiException>()));
  });
}
