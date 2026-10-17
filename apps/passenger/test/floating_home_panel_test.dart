import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/widgets/ride_bottom_sheet.dart';

void main() {
  testWidgets('floating destination card leaves the map visible and interactive', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var destinationTaps = 0;
    var confirmations = 0;

    Widget screen({String? destination, String? route}) => MaterialApp(
      theme: RamoTheme.light,
      home: Scaffold(
        bottomNavigationBar: const SizedBox(height: 68),
        body: Stack(children: [
          const Positioned.fill(child: ColoredBox(key: Key('map-background'), color: Colors.blueGrey)),
          RideBottomSheet(
            origin: 'Minha localização',
            destination: destination,
            routeSummary: route,
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
    expect(find.byKey(const Key('confirm-destination-button')), findsNothing);
    expect(tester.getSize(find.byKey(const Key('floating-trip-card'))).height, lessThan(240));
    expect(tester.getRect(find.byKey(const Key('floating-trip-card'))).top, greaterThan(300));
    await tester.tap(find.text('Pra onde vamos?'));
    expect(destinationTaps, 1);

    await tester.pumpWidget(screen(destination: 'Preá', route: '12,1 km · 29 min'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('floating-route-summary')), findsOneWidget);
    expect(find.text('Confirmar destino'), findsOneWidget);
    await tester.tap(find.byKey(const Key('confirm-destination-button')));
    expect(confirmations, 1);
    expect(tester.takeException(), isNull);
  });
}
