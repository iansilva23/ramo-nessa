import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/vehicle_selection_screen.dart';

void main() {
  testWidgets(
    'contador do Táxi Buggy respeita mínimo e máximo do Admin',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: VehicleSelectionScreen(
            originLabel: 'Jericoacoara',
            destinationLabel: 'Jericoacoara',
            routeSummary: '2,5 km · 7 min',
            availableServices: const [ServiceType.buggy],
            initialService: ServiceType.buggy,
            buggyMinPassengers: 2,
            buggyMaxPassengers: 3,
            onContinue: (_) async => null,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Táxi Buggy'), findsOneWidget);
      expect(find.textContaining(r'R$'), findsNothing);

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

      expect(find.text('3'), findsOneWidget);
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
