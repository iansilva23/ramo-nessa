import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/widgets/ride_bottom_sheet.dart';

void main() {
  testWidgets(
    'contador do Buggy respeita mínimo e máximo do Admin',
    (tester) async {
      var count = 2;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) {
                return RideBottomSheet(
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
                    setState(() {
                      count = value;
                    });
                  },
                  onServiceChanged: (_) {},
                  onOriginTap: () {},
                  onDestinationTap: () {},
                  onRequestRide: () {},
                );
              },
            ),
          ),
        ),
      );
      await tester.pump();

      final list = find.byType(ListView).first;
      await tester.drag(list, const Offset(0, -320));
      await tester.pumpAndSettle();

      final remove = find.widgetWithIcon(
        IconButton,
        Icons.remove_rounded,
      );
      final add = find.widgetWithIcon(
        IconButton,
        Icons.add_rounded,
      );

      expect(remove, findsOneWidget);
      expect(add, findsOneWidget);
      expect(
        tester.widget<IconButton>(remove).onPressed,
        isNull,
      );
      expect(
        tester.widget<IconButton>(add).onPressed,
        isNotNull,
      );

      await tester.tap(add);
      await tester.pumpAndSettle();

      expect(count, 3);
      expect(
        tester.widget<IconButton>(add).onPressed,
        isNull,
      );
      expect(
        tester.widget<IconButton>(remove).onPressed,
        isNotNull,
      );
    },
  );
}
