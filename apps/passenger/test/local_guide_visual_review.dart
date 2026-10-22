// Opt-in screenshots of real Flutter widgets with synthetic content and an
// existing brand photograph. No fixture is inserted into a live database.
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/guide/data/local_guide_service.dart';
import 'package:ramo_nessa_passenger/src/features/guide/presentation/local_guide_screen.dart';
import 'local_guide_test.dart' show Service;

final core = Uri.parse('https://core.example');
GuideEntry sample(
  String id,
  String kind,
  String name, {
  String? parent,
  String? template,
  int order = 0,
  bool featured = false,
}) => GuideEntry({
  'id': id,
  'kind': kind,
  'name': name,
  'parentId': parent,
  'order': order,
  'template': template,
  'image': '/v1/content/guide/images/fixture',
  'summary': 'Conteúdo de teste para revisão visual.',
  'description':
      'Informações de teste. Nenhum cadastro desta revisão é publicado.',
  'filters': ['Praias', 'Aventura'],
  'tags': ['Praias'],
  'featured': featured,
  'badge': featured ? 'Destaque de teste' : '',
  'icon': template == 'rules'
      ? 'eco'
      : template == 'gastronomy'
      ? 'restaurant'
      : template == 'venues'
      ? 'music'
      : 'explore',
  'address': kind == 'item' ? 'Jericoacoara · teste' : '',
  'duration': template == 'tours' ? '4 horas' : '',
  'date': template == 'events' ? '2026-12-31' : '',
  'cuisine': template == 'gastronomy' ? 'Culinária de teste' : '',
  'actions': kind == 'item'
      ? [
          {'id': 'i', 'type': 'instagram', 'label': 'Instagram'},
          {
            'id': 'w',
            'type': 'whatsapp',
            'label': 'WhatsApp para delivery',
            'primary': true,
          },
        ]
      : [],
}, baseUrl: core);
final models = [
  ['tours', 'Passeios em Jeri'],
  ['rules', 'Regras Locais'],
  ['highlights', 'O que fazer em Jeri'],
  ['events', 'Réveillon em Jeri'],
  ['gastronomy', 'Gastronomia em Jeri'],
  ['venues', 'Casas de show em Jeri'],
];
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final regular = await File(
          '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        ).readAsBytes(),
        bold = await File(
          '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        ).readAsBytes();
    for (final name in ['Inter', 'Roboto']) {
      await (FontLoader(name)
            ..addFont(Future.value(ByteData.sublistView(regular)))
            ..addFont(Future.value(ByteData.sublistView(bold))))
          .load();
    }
    final root = Platform.environment['FLUTTER_ROOT'];
    if (root != null) {
      final bytes = await File(
        '$root/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
      ).readAsBytes();
      await (FontLoader(
        'MaterialIcons',
      )..addFont(Future.value(ByteData.sublistView(bytes)))).load();
    }
  });
  setUp(() async {
    final bytes = await File(
          '../../packages/design_system/assets/auth/login_hero.webp',
        ).readAsBytes(),
        codec = await ui.instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    PaintingBinding.instance.imageCache.putIfAbsent(
      const NetworkImage(
        'https://core.example/v1/content/guide/images/fixture',
      ),
      () => OneFrameImageStreamCompleter(
        Future.value(ImageInfo(image: frame.image)),
      ),
    );
  });
  for (final width in [320, 390, 900]) {
    testWidgets('home visual $width', (tester) async {
      tester.view.physicalSize = Size(
        width.toDouble(),
        width == 320 ? 740 : 1000,
      );
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final catalog = GuideCatalog(
        entries: [
          sample('jeri', 'locality', 'Jericoacoara'),
          sample('prea', 'locality', 'Preá', order: 1),
          sample('jijoca', 'locality', 'Jijoca', order: 2),
          for (var i = 0; i < models.length; i++)
            sample(
              models[i][0],
              'category',
              models[i][1],
              parent: 'jeri',
              template: models[i][0],
              order: i,
            ),
        ],
      );
      await tester.pumpWidget(
        MaterialApp(
          home: RepaintBoundary(
            key: const Key('capture'),
            child: LocalGuideScreen(
              service: Service(catalog),
              onDestination: (_) {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await expectLater(
        find.byKey(const Key('capture')),
        matchesGoldenFile('../guide-test-artifacts/home-$width.png'),
      );
    });
  }
  for (final model in models) {
    testWidgets('category visual ${model[0]}', (tester) async {
      tester.view.physicalSize = const Size(390, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = sample('category', 'category', model[1], template: model[0]),
          catalog = GuideCatalog(
            entries: [
              c,
              sample(
                'one',
                'item',
                'Experiência de teste',
                parent: c.id,
                template: model[0],
                featured: model[0] == 'highlights',
              ),
              sample(
                'two',
                'item',
                'Outra descoberta',
                parent: c.id,
                template: model[0],
              ),
            ],
          );
      await tester.pumpWidget(
        MaterialApp(
          home: RepaintBoundary(
            key: const Key('capture'),
            child: GuideCategoryPage(category: c, catalog: catalog),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await expectLater(
        find.byKey(const Key('capture')),
        matchesGoldenFile('../guide-test-artifacts/${model[0]}.png'),
      );
    });
  }
}
