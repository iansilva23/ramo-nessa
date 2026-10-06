import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_driver/src/core/communications/app_release_policy_service.dart';

void main() {
  test('consulta política de versão por app, plataforma e build', () async {
    late http.Request captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        '{"appKind":"passenger","platform":"android",'
        '"latestVersion":"0.2.0","latestBuild":2,"minimumBuild":1,'
        '"updateMessage":"Atualize o app.","currentBuild":1,'
        '"updateAvailable":true,"updateRequired":false}',
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final service = HttpAppReleasePolicyService(
      baseUrl: Uri.parse('https://core.example.test'),
      client: client,
    );
    final policy = await service.check(
      appKind: 'passenger',
      platform: 'android',
      buildNumber: 1,
    );

    expect(policy.updateAvailable, true);
    expect(policy.latestVersion, '0.2.0');
    expect(captured.url.queryParameters['app'], 'passenger');
    expect(captured.url.queryParameters['platform'], 'android');
    expect(captured.url.queryParameters['build'], '1');
  });
}
