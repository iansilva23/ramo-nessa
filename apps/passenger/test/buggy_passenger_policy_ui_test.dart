import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/widgets/ride_bottom_sheet.dart';

void main() {
  testWidgets('contador do Buggy respeita mínimo e máximo do Admin', (tester) async {
    var count = 2;

    Widget build() {
      return MaterialApp(
        home: Scaffold(
          body: RideBottomSheet(
            selectedService: ServiceType.buggy,
            availableServices: const [ServiceType.buggy],
            origin: 'Jericoacoara',
            destination: 'Jericoacoara',
            estimatedFare: 'R\$ 40,00',
            priceIsFinal: true,
            passengerCount: count,
            minPassengerCount: 2,
            maxPassengerCount: 3,
            onPassengerCountChanged: (value) {
              count = value;
            },
            onServiceChanged: (_) {},
            onOriginTap: () {},
            onDestinationTap: () {},
            onRequestRide: () {},
          ),
        ),
      );
    }

    await tester.pumpWidget(build());
    await tester.pump();

    final remove = find.widgetWithIcon(
      IconButton,
      Icons.remove_rounded,
    );
    final add = find.widgetWithIcon(
      IconButton,
      Icons.add_rounded,
    );

    expect(tester.widget<IconButton>(remove).onPressed, isNull);
    expect(tester.widget<IconButton>(add).onPressed, isNotNull);

    await tester.tap(add);
    await tester.pumpWidget(build());
    await tester.pump();

    expect(count, 3);
    expect(
      tester.widget<IconButton>(
        find.widgetWithIcon(
          IconButton,
          Icons.add_rounded,
        ),
      ).onPressed,
      isNull,
    );
  });
}
