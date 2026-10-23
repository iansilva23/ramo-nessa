import 'dart:io';

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
    final regularBytes = await File(path).readAsBytes();
    final font = FontLoader('Roboto')
      ..addFont(Future<ByteData>.value(ByteData.sublistView(regularBytes)));
    final boldPath = path.replaceFirst('DejaVuSans.ttf', 'DejaVuSans-Bold.ttf');
    if (File(boldPath).existsSync()) {
      final boldBytes = await File(boldPath).readAsBytes();
      font.addFont(Future<ByteData>.value(ByteData.sublistView(boldBytes)));
    }
    await font.load();

    // Unlike real APK builds, Flutter widget tests do not ship MaterialIcons.
    // Load the SDK's icon font for recognizable controls in the screenshots.
    final sdk = Platform.environment['FLUTTER_ROOT'];
    if (sdk != null) {
      final iconsFile = File(
        '$sdk/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
      );
      if (iconsFile.existsSync()) {
        final iconBytes = await iconsFile.readAsBytes();
        final icons = FontLoader('MaterialIcons')
          ..addFont(Future<ByteData>.value(ByteData.sublistView(iconBytes)));
        await icons.load();
      }
    }
  });

  for (final width in [320, 390]) {
    for (final dark in [false, true]) {
      for (final destinationSelected in [false, true]) {
        final appearance = dark ? 'dark' : 'light';
        final stage = destinationSelected ? 'selected' : 'empty';
        final imageName = width == 390
            ? 'v5-floating-$appearance-$stage.png'
            : 'v5-floating-$width-$appearance-$stage.png';
        testWidgets('review floating route ${width}px $appearance/$stage', (tester) async {
          tester.view.physicalSize = Size(width.toDouble(), width == 320 ? 640 : 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        // Material buttons use a standalone text style which does not
        // necessarily inherit the font loaded for regular Text widgets.
        // Override it in this screenshot harness ONLY; runtime themes stay
        // exactly as they were. Otherwise Flutter Test paints Ahem blocks
        // instead of the CTA text in the captured images.
        final baseTheme = dark ? RamoTheme.dark : RamoTheme.light;
        final captureTheme = baseTheme.copyWith(
          filledButtonTheme: FilledButtonThemeData(
            style: baseTheme.filledButtonTheme.style?.copyWith(
              textStyle: const WidgetStatePropertyAll<TextStyle>(
                TextStyle(
                  fontFamily: 'Roboto',
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.2,
                ),
              ),
            ),
          ),
        );
        await tester.pumpWidget(MaterialApp(
          theme: captureTheme,
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
          matchesGoldenFile('goldens/$imageName'),
        );
        expect(tester.takeException(), isNull);
      });
    }
  }
}
}
