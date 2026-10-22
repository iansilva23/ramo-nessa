import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/guide/data/local_guide_service.dart';
import 'package:ramo_nessa_passenger/src/features/guide/presentation/local_guide_screen.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/place_search_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';

GuideEntry entry(
  String id,
  String kind,
  String name, {
  String? parent,
  String? template,
  List<Map<String, dynamic>> actions = const [],
  List<String> tags = const [],
  bool featured = false,
}) => GuideEntry({
  'id': id,
  'kind': kind,
  'name': name,
  'parentId': parent,
  'template': template,
  'summary': 'Descrição de teste',
  'image': '',
  'filters': ['Praias', 'Aventura'],
  'tags': tags,
  'featured': featured,
  'latitude': -2.8,
  'longitude': -40.5,
  'actions': actions,
});

class Service implements LocalGuideService {
  Service(this.catalog);
  final GuideCatalog catalog;
  int calls = 0;
  @override
  Future<GuideCatalog> load({bool refresh = false}) async {
    calls++;
    return catalog;
  }
}

class Places implements PlaceSearchService, CoordinatePlaceResolver {
  int calls = 0;
  @override
  Future<List<RamoPlace>> search(String q) async => [];
  @override
  Future<RamoPlace?> classifyCoordinate(LatLng p) async {
    calls++;
    return RamoPlace(
      name: 'Classificado',
      address: 'Endereço validado',
      position: p,
      placeProof: 'signed-proof',
      approvedPricingZoneId: 'prea',
    );
  }
}

void main() {
  test(
    'HTTP content is cached, pending calls share one request and refresh handles offline content',
    () async {
      int calls = 0;
      bool offline = false;
      final service = HttpLocalGuideService(
        baseUrl: Uri.parse('https://core.example'),
        client: MockClient((r) async {
          calls++;
          if (offline) throw Exception('offline');
          return http.Response(
            jsonEncode({
              'entities': [
                {
                  'id': 'p',
                  'name': 'Preá',
                  'kind': 'locality',
                  'parentId': null,
                },
              ],
            }),
            200,
          );
        }),
      );
      final results = await Future.wait([service.load(), service.load()]);
      expect(calls, 1);
      expect(results.first.entries.single.name, 'Preá');
      await service.load();
      expect(calls, 1);
      offline = true;
      expect((await service.load(refresh: true)).stale, true);
      expect(calls, 2);
    },
  );
  test('WhatsApp messages are encoded and external URLs use safe schemes', () {
    final a = GuideAction({
      'id': 'w',
      'type': 'whatsapp',
      'phone': '5588999999999',
      'message': 'Olá! & teste',
    });
    expect(a.externalUri!.host, 'wa.me');
    expect(a.externalUri!.queryParameters['text'], 'Olá! & teste');
    expect(
      GuideAction({
        'id': 'x',
        'type': 'website',
        'url': 'javascript:alert(1)',
      }).externalUri,
      isNull,
    );
    expect(
      GuideAction({
        'id': 'x',
        'type': 'instagram',
        'url': 'https://evil.example',
      }).externalUri,
      isNull,
    );
  });
  test('guide image URLs stay on the configured Core', () {
    final e = GuideEntry({
      'image': 'https://evil.example/x',
    }, baseUrl: Uri.parse('https://core.example'));
    expect(e.imageUrl, isNull);
  });
  testWidgets(
    'locality switches inline, selection and category state survive back navigation',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final catalog = GuideCatalog(
            entries: [
              entry('j', 'locality', 'Jericoacoara'),
              entry('p', 'locality', 'Preá'),
              entry(
                'food',
                'category',
                'Gastronomia',
                parent: 'j',
                template: 'gastronomy',
              ),
              entry(
                'beach',
                'category',
                'Praias do Preá',
                parent: 'p',
                template: 'highlights',
              ),
            ],
          ),
          service = Service(catalog);
      await tester.pumpWidget(
        MaterialApp(
          home: LocalGuideScreen(service: service, onDestination: (_) {}),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Gastronomia'), findsOneWidget);
      await tester.tap(find.text('Preá'));
      await tester.pumpAndSettle();
      expect(find.text('Gastronomia'), findsNothing);
      expect(find.text('Praias do Preá'), findsOneWidget);
      await tester.ensureVisible(find.text('Praias do Preá'));
      await tester.tap(find.text('Praias do Preá'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Voltar'));
      await tester.pumpAndSettle();
      expect(find.text('Praias do Preá'), findsOneWidget);
      expect(service.calls, 1);
      expect(tester.takeException(), isNull);
    },
  );
  for (final template in [
    'tours',
    'rules',
    'highlights',
    'events',
    'gastronomy',
    'venues',
  ]) {
    testWidgets(
      'template $template renders filters, optional data and multiple independent actions without overflow',
      (tester) async {
        await tester.binding.setSurfaceSize(const Size(390, 844));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        final category = entry(
              'c',
              'category',
              'Categoria teste',
              template: template,
            ),
            item = entry(
              'i',
              'item',
              'Conteúdo teste',
              parent: 'c',
              tags: ['Praias'],
              featured: template == 'highlights',
              actions: [
                {
                  'id': 'i',
                  'type': 'instagram',
                  'label': 'Instagram',
                  'url': 'https://instagram.com/example',
                },
                {
                  'id': 'w',
                  'type': 'whatsapp',
                  'label': 'WhatsApp para delivery',
                  'phone': '5588999999999',
                },
              ],
            );
        final catalog = GuideCatalog(entries: [category, item]);
        await tester.pumpWidget(
          MaterialApp(
            home: GuideCategoryPage(category: category, catalog: catalog),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Categoria teste'), findsOneWidget);
        expect(find.text('Conteúdo teste'), findsOneWidget);
        await tester.tap(find.text('Aventura'));
        await tester.pumpAndSettle();
        expect(find.text('Conteúdo teste'), findsNothing);
        await tester.tap(find.text('Todos'));
        await tester.pumpAndSettle();
        expect(find.text('Conteúdo teste'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'route action classifies the destination and never calls a ride or payment API',
    (tester) async {
      final places = Places(),
          item = entry(
            'i',
            'item',
            'Casa de show',
            actions: [
              {'id': 'r', 'type': 'route', 'label': 'Calcular rota'},
            ],
          );
      RamoPlace? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                result = await runGuideAction(
                  context,
                  item,
                  item.actions.single,
                  GuideCatalog(entries: [item]),
                  places,
                );
              },
              child: const Text('Testar rota'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Testar rota'));
      await tester.pumpAndSettle();
      expect(places.calls, 1);
      expect(result?.name, 'Casa de show');
      expect(result?.position, const LatLng(-2.8, -40.5));
      expect(result?.placeProof, 'signed-proof');
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('delivery action layout has no mandatory route button', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: GuideActionButtons(
            actions: [
              GuideAction({
                'id': 'i',
                'type': 'instagram',
                'label': 'Instagram',
              }),
              GuideAction({'id': 'w', 'type': 'whatsapp', 'label': 'WhatsApp'}),
            ],
            onAction: (_) {},
          ),
        ),
      ),
    );
    expect(find.text('Calcular rota'), findsNothing);
    expect(find.text('Instagram'), findsOneWidget);
    expect(find.text('WhatsApp'), findsOneWidget);
  });
}
