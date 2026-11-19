import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_nessa_passenger/src/features/guide/data/local_guide_service.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/passenger_main_shell.dart';
import 'package:ramo_nessa_passenger/src/features/tours/data/agency_tour_service.dart';
import 'local_guide_test.dart' show Service;

void main() {
  testWidgets('Guide navigation and surrounding background follow light, dark and system without changing tabs', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    final mode = ValueNotifier(ThemeMode.light);
    addTearDown(mode.dispose);
    final guide = Service(GuideCatalog(entries: [
      GuideEntry({'id': 'jeri', 'kind': 'locality', 'name': 'Jericoacoara'}),
    ]));
    await tester.pumpWidget(ValueListenableBuilder<ThemeMode>(
      valueListenable: mode,
      builder: (context, value, _) => MaterialApp(
        theme: RamoTheme.light, darkTheme: RamoTheme.dark, themeMode: value,
        home: PassengerMainShell(
          homeBuilder: (_, openGuide, _) => Center(child: TextButton(onPressed: openGuide, child: const Text('Abrir guia'))),
          activityService: null, authService: null, paymentService: null,
          savedPlaceService: null, placeSearchService: null, accessToken: null,
          tourService: const PreviewAgencyTourService(), guideService: guide,
        ),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Abrir guia'));
    await tester.pumpAndSettle();

    void check(Brightness brightness) {
      final finder = find.byType(NavigationBar);
      final bar = tester.widget<NavigationBar>(finder);
      final theme = Theme.of(tester.element(finder));
      final shell = tester.widget<Scaffold>(find.ancestor(of: finder, matching: find.byType(Scaffold)).first);
      expect(bar.selectedIndex, 1);
      expect(bar.indicatorColor, RamoColors.brandYellow);
      expect(theme.brightness, brightness);
      if (brightness == Brightness.light) {
        expect(bar.backgroundColor!.computeLuminance(), greaterThan(.9));
        expect(shell.backgroundColor!.computeLuminance(), greaterThan(.9));
        expect(theme.navigationBarTheme.labelTextStyle!.resolve({WidgetState.selected})!.color!.computeLuminance(), lessThan(.1));
      } else {
        expect(bar.backgroundColor!.computeLuminance(), lessThan(.02));
        expect(shell.backgroundColor!.computeLuminance(), lessThan(.02));
        expect(theme.navigationBarTheme.labelTextStyle!.resolve({WidgetState.selected})!.color, RamoColors.brandYellow);
      }
      expect(tester.takeException(), isNull);
    }

    check(Brightness.light);
    mode.value = ThemeMode.dark;
    await tester.pumpAndSettle();
    check(Brightness.dark);
    mode.value = ThemeMode.light;
    await tester.pumpAndSettle();
    check(Brightness.light);
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    mode.value = ThemeMode.system;
    await tester.pumpAndSettle();
    check(Brightness.dark);
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
    await tester.pumpAndSettle();
    check(Brightness.light);
    await tester.pumpWidget(const SizedBox());
  });
}
