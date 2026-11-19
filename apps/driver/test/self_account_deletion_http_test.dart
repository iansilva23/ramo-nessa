import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_driver/src/features/profile/data/http_driver_privacy_service.dart';
void main() {
  test('old Core hides unavailable self deletion without breaking privacy', () async {
    final service = HttpDriverPrivacyService(baseUrl:Uri.parse('https://core.example.test'),accessToken:'owner-session',client:MockClient((_) async => http.Response('{}',404)));
    expect((await service.deletionOverview()).available,false);
  });
  test('deletion sends only confirmation with the current authenticated session', () async {
    final service = HttpDriverPrivacyService(baseUrl:Uri.parse('https://core.example.test'),accessToken:'owner-session',client:MockClient((request) async {
      expect(request.url.path,'/v1/me/account-deletion');expect(request.headers['authorization'],'Bearer owner-session');
      expect(jsonDecode(request.body),{'confirmed':true});
      return http.Response(jsonEncode({'id':'job-test','status':'processing'}),202);
    }));
    final result = await service.deleteOwnAccount();expect(result.deleted,false);expect(result.id,'job-test');
  });
}
