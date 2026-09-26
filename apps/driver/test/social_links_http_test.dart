import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_driver/src/core/communications/social_links_service.dart';

void main() {
  test('carrega Instagram oficial do Core', () async {
    final service = HttpSocialLinksService(
      baseUrl: Uri.parse('https://core.example.test'),
      client: MockClient((request) async {
        expect(request.url.path, '/v1/content/social-links');
        return http.Response(
          '{"instagramHandle":"@ramonessa",'
          '"instagramUrl":"https://www.instagram.com/ramonessa/",'
          '"updatedAt":"2026-09-26T14:00:00.000Z"}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    final links = await service.load();
    expect(links.instagramHandle, '@ramonessa');
    expect(
      links.instagramUrl,
      'https://www.instagram.com/ramonessa/',
    );
  });
}
