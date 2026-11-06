import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/core/communications/agency_promotion_service.dart';

void main() {
  test('carrega conteúdo remoto da Ramo Nessa Agência', () async {
    final service = HttpAgencyPromotionService(
      baseUrl: Uri.parse('https://core.example.test'),
      client: MockClient((request) async => http.Response(
        '{"id":"ramo-nessa-agencia","enabled":true,'
        '"title":"Ramo Nessa Agência",'
        '"subtitle":"Passeios em Jeri",'
        '"description":"Experiências locais.",'
        '"ctaLabel":"Ver passeios",'
        '"ctaUrl":"https://example.com/passeios",'
        '"updatedAt":"2026-09-24T05:00:00.000Z"}',
        200,
        headers: {'content-type': 'application/json'},
      )),
    );

    final promotion = await service.load();
    expect(promotion.enabled, true);
    expect(promotion.title, 'Ramo Nessa Agência');
    expect(promotion.ctaLabel, 'Ver passeios');
  });
}
