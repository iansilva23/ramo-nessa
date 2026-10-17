import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/widgets/ride_bottom_sheet.dart';

// This is intentionally NOT named *_test.dart. It is an opt-in screenshot
// generator; the regular Flutter tests do not require checked-in goldens.
// The gray background is a map PLACEHOLDER, not a Google Maps screenshot.
void main() {
  setUpAll(() async {
    // Flutter widget tests use the Ahem font by default, which draws blocks
    // instead of readable text. A runner-provided test font is loaded under
    // the Material font family exclusively for these review images.
    final path = Platform.environment['RAMO_VISUAL_FONT_PATH'] ??
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    final bytes = await File(path).readAsBytes();
    final loader = FontLoader('Roboto')
      ..addFont(Future<ByteData>.value(ByteData.sublistView(bytes)));
    await loader.load();
  });

  for (final dark in [false, true]) {
    for (final destinationSelected in [false, true]) {
      final appearance = dark ? 'dark' : 'light';
      final stage = destinationSelected ? 'selected' : 'empty';
      testWidgets('review floating route $appearance/$stage', (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await tester.pumpWidget(MaterialApp(
          theme: dark ? RamoTheme.dark : RamoTheme.light,
          home: RepaintBoundary(
            key: const Key('visual-review-screen'),
            child: Scaffold(
              body: Stack(
                children: [
                  const Positioned.fill(
                    child: ColoredBox(color: Color(0xFF354651)),
                  ),
                  const Positioned(
                    top: 100,
                    left: 20,
                    child: Text(
                      'MAPA SIMULADO PARA REVISÃO DO CARD',
                      style: TextStyle(color: Colors.white, fontSize: 10),
                    ),
                  ),
                  RideBottomSheet(
                    origin: 'Minha localização',
                    destination: destinationSelected ? 'Preá' : null,
                    routeSummary: destinationSelected
                        ? '12,1 km · 29 min'
                        : null,
                    onOriginTap: () {},
                    onDestinationTap: () {},
                    onDestinationClear: () {},
                    onContinue: () {},
                  ),
                ],
              ),
              bottomNavigationBar: NavigationBar(
                selectedIndex: 0,
                onDestinationSelected: (_) {},
                destinations: const [
                  NavigationDestination(
                    icon: Icon(Icons.map_outlined),
                    label: 'Início',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.explore_outlined),
                    label: 'Passeios',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.receipt_long_outlined),
                    label: 'Atividade',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.person_outline),
                    label: 'Perfil',
                  ),
                ],
              ),
            ),
          ),
        ));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await expectLater(
          find.byKey(const Key('visual-review-screen')),
          matchesGoldenFile('goldens/v5-floating-$appearance-$stage.png'),
        );
      });
    }
  }
}
