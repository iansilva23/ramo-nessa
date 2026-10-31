import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/tours/data/agency_tour_service.dart';

void main() {
  test('carrega catálogo administrável de passeios do Core', () async {
    final service = HttpAgencyTourService(
      baseUrl: Uri.parse('https://core.example.test'),
      client: MockClient((request) async {
        expect(request.url.path, '/v1/content/tours');
        return http.Response(
          '''
          {
            "tours": [
              {
                "slug": "lado-leste",
                "enabled": true,
                "sortOrder": 10,
                "title": "Passeio Lado Leste",
                "badge": "COMPARTILHADO",
                "shortDescription": "Lagoas e praias.",
                "description": "Descrição completa.",
                "highlights": ["Árvore da Preguiça", "Praia do Preá"],
                "included": ["Transporte"],
                "excluded": ["Alimentação"],
                "duration": "6 horas",
                "schedule": "Saída pela manhã",
                "departure": "Jericoacoara",
                "priceLabel": "A partir de",
                "priceCents": 7500,
                "priceSuffix": "por pessoa",
                "whatsappPhone": "+5588999999999",
                "whatsappMessage": "Olá! Quero reservar o Lado Leste.",
                "coverImageUrl": "/v1/content/tours/lado-leste/cover?v=3",
                "coverImageVersion": 3,
                "updatedAt": "2026-09-26T16:00:00.000Z"
              }
            ]
          }
          ''',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    final tours = await service.listTours();
    expect(tours, hasLength(1));

    final tour = tours.single;
    expect(tour.title, 'Passeio Lado Leste');
    expect(tour.priceCents, 7500);
    expect(tour.highlights, ['Árvore da Preguiça', 'Praia do Preá']);
    expect(
      tour.coverImageUrl,
      'https://core.example.test/v1/content/tours/lado-leste/cover?v=3',
    );
    expect(tour.reservationUri?.host, 'wa.me');
    expect(tour.reservationUri?.path, '/5588999999999');
    expect(
      tour.reservationUri?.queryParameters['text'],
      'Olá! Quero reservar o Lado Leste.',
    );
  });

  test('detalhe retorna null quando passeio deixa de existir', () async {
    final service = HttpAgencyTourService(
      baseUrl: Uri.parse('https://core.example.test'),
      client: MockClient((request) async {
        expect(request.url.path, '/v1/content/tours/lado-oeste');
        return http.Response(
          '{"error":"TOUR_NOT_FOUND"}',
          404,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    expect(await service.getTour('lado-oeste'), isNull);
  });

  test('reserva fica indisponível sem WhatsApp configurado', () {
    final tour = AgencyTour(
      slug: 'teste',
      enabled: true,
      sortOrder: 1,
      title: 'Passeio Teste',
      badge: 'EXPERIÊNCIA',
      shortDescription: 'Teste',
      description: 'Teste',
      highlights: const [],
      included: const [],
      excluded: const [],
      priceLabel: 'Consulte',
      whatsappPhone: '',
      whatsappMessage: '',
      coverImageVersion: 0,
      updatedAt: DateTime.utc(2026, 9, 26),
    );

    expect(tour.reservationUri, isNull);
  });
}
