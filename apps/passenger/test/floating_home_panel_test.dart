import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/widgets/ride_bottom_sheet.dart';
import 'package:ramo_nessa_passenger/src/core/config/ramo_map_config.dart';

void main() {
  test('map safe-area reservation is based on the map viewport', () {
    const mapViewport = Size(390, 720);
    final withoutDestination = ramoHomeMapPadding(
      viewport: mapViewport,
      safeTop: 47,
      sheetExtent: .23,
    );
    final withDestination = ramoHomeMapPadding(
      viewport: mapViewport,
      safeTop: 47,
      sheetExtent: .37,
    );
    expect(withoutDestination.top, 123);
    expect(withoutDestination.bottom, closeTo(177.6, .001));
    expect(withDestination.bottom, closeTo(278.4, .001));
    expect(withDestination.bottom, lessThan(mapViewport.height - withDestination.top));
    expect(withDestination.bottom, greaterThan(withoutDestination.bottom));
  });

  testWidgets('floating destination card leaves the map visible and interactive', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var destinationTaps = 0;
    var confirmations = 0;
    var mapTaps = 0;

    Widget screen({
      String? destination,
      String? route,
      bool preparing = false,
      bool routeLoading = false,
      String? coverageMessage,
    }) => MaterialApp(
      theme: RamoTheme.light,
      home: Scaffold(
        bottomNavigationBar: const SizedBox(height: 68),
        body: Stack(children: [
          Positioned.fill(
            child: GestureDetector(
              key: const Key('map-interaction-layer'),
              behavior: HitTestBehavior.opaque,
              onTap: () => mapTaps++,
              child: const ColoredBox(
                key: Key('map-background'),
                color: Colors.blueGrey,
              ),
            ),
          ),
          RideBottomSheet(
            origin: 'Minha localização',
            destination: destination,
            routeSummary: route,
            isPreparing: preparing,
            routeLoading: routeLoading,
            coverageMessage: coverageMessage,
            onOriginTap: () {},
            onDestinationTap: () => destinationTaps++,
            onContinue: () => confirmations++,
            onDestinationClear: () {},
          ),
        ]),
      ),
    );

    await tester.pumpWidget(screen());
    await tester.pumpAndSettle();
    expect(find.byType(DraggableScrollableSheet), findsNothing);
    expect(find.text('Escolha seu destino'), findsNothing);
    expect(find.byKey(const Key('floating-trip-card')), findsOneWidget);
    final lightCard = tester.widget<Material>(
      find.byKey(const Key('floating-trip-card')),
    );
    expect(lightCard.color, Colors.white);
    expect(lightCard.elevation, 4);
    expect(lightCard.shadowColor, Colors.black.withValues(alpha: .14));
    expect(find.byKey(const Key('confirm-destination-button')), findsNothing);
    expect(tester.getSize(find.byKey(const Key('floating-trip-card'))).height, lessThan(240));
    expect(tester.getRect(find.byKey(const Key('floating-trip-card'))).top, greaterThan(300));
    // The card must not create a full-screen hit-test barrier on the map.
    await tester.tapAt(const Offset(120, 150));
    expect(mapTaps, 1);
    await tester.tap(find.text('Pra onde vamos?'));
    expect(destinationTaps, 1);

    await tester.pumpWidget(screen(destination: 'Preá', route: '12,1 km · 29 min'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('floating-route-summary')), findsOneWidget);
    expect(find.text('Confirmar destino'), findsOneWidget);
    // Keep the map's legally required attribution below the controls.
    expect(tester.getRect(find.byKey(const Key('confirm-destination-button'))).bottom,
        lessThanOrEqualTo(844 - 68 - 32));
    await tester.tapAt(const Offset(120, 150));
    expect(mapTaps, 2);
    await tester.tap(find.byKey(const Key('confirm-destination-button')));
    expect(confirmations, 1);
    expect(tester.takeException(), isNull);
  });
  testWidgets('the dark trip card keeps its original surface', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
      theme: RamoTheme.light,
      darkTheme: RamoTheme.dark,
      themeMode: ThemeMode.dark,
      home: Scaffold(body: RideBottomSheet(
        origin: 'Minha localização',
        onOriginTap: () {},
        onDestinationTap: () {},
        onContinue: () {},
      )),
    ));
    await tester.pumpAndSettle();
    final darkCard = tester.widget<Material>(
      find.byKey(const Key('floating-trip-card')),
    );
    expect(darkCard.color, RamoColors.darkSurface);
    expect(darkCard.elevation, 3);
    expect(darkCard.shadowColor, Colors.black26);
  });

  testWidgets('map receives a layout-settled callback after the route panel expands', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var settled = 0;
    Widget screen({String? destination, String? route}) => MaterialApp(
      theme: RamoTheme.light,
      home: Scaffold(body: RideBottomSheet(
        origin: 'Minha localização',
        destination: destination,
        routeSummary: route,
        onLayoutSettled: () => settled++,
        onOriginTap: () {},
        onDestinationTap: () {},
        onContinue: () {},
      )),
    );
    await tester.pumpWidget(screen());
    await tester.pumpAndSettle();
    settled = 0;
    await tester.pumpWidget(screen(destination: 'Preá', route: '12 km · 29 min'));
    await tester.pumpAndSettle();
    expect(settled, greaterThan(0));
  });

  testWidgets('confirm destination is disabled during preparation, route loading and coverage failure', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var confirmations = 0;

    Future<void> render({
      bool preparing = false,
      bool routeLoading = false,
      String? coverage,
    }) async {
      await tester.pumpWidget(MaterialApp(
        theme: RamoTheme.light,
        home: Scaffold(
          body: Stack(children: [
            const Positioned.fill(child: ColoredBox(color: Colors.blueGrey)),
            RideBottomSheet(
              origin: 'Minha localização',
              destination: 'Preá',
              routeSummary: '12,1 km · 29 min',
              isPreparing: preparing,
              routeLoading: routeLoading,
              coverageMessage: coverage,
              onOriginTap: () {},
              onDestinationTap: () {},
              onContinue: () => confirmations++,
            ),
          ]),
        ),
      ));
      // pumpAndSettle cannot settle an active indeterminate progress indicator.
      await tester.pump(const Duration(milliseconds: 320));
    }

    await render(preparing: true);
    expect(find.text('Preparando corrida…'), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('confirm-destination-button')))
          .onPressed,
      isNull,
    );
    expect(confirmations, 0);

    await render(routeLoading: true);
    expect(find.text('Calculando rota…'), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('confirm-destination-button')))
          .onPressed,
      isNull,
    );

    await render(coverage: 'Fora da área atendida.');
    expect(find.text('Fora da área atendida.'), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('confirm-destination-button')))
          .onPressed,
      isNull,
    );

    await render();
    final button = tester.widget<FilledButton>(find.byKey(const Key('confirm-destination-button')));
    expect(button.onPressed, isNotNull);
    await tester.tap(find.byKey(const Key('confirm-destination-button')));
    expect(confirmations, 1);
    expect(tester.takeException(), isNull);
  });

}
