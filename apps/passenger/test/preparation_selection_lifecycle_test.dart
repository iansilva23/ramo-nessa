import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/vehicle_selection_screen.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/domain/pricing_quote.dart';

void main() {
  Future<void> phoneViewport(WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 932));
    addTearDown(() => tester.binding.setSurfaceSize(null));
  }
  Widget selector(VoidCallback changed, Future<String?> Function(VehicleSelectionResult) submit) =>
    MaterialApp(home: VehicleSelectionScreen(originLabel: 'Preá', destinationLabel: 'Jijoca',
      routeSummary: '12 km', availableServices: const [ServiceType.car, ServiceType.moto],
      initialService: ServiceType.car, buggyMinPassengers: 1, buggyMaxPassengers: 4,
      onSelectionChanged: changed, onContinue: submit,
      onQuote: (_) async => PricingQuote.fromJson({'kind': 'exact', 'ruleId': 'synthetic', 'totalAmountCents': 12000}),
    ));
  testWidgets('a retry of unchanged selection does not start another intent', (tester) async {
    await phoneViewport(tester);
    var changes = 0;
    var submissions = 0;
    await tester.pumpWidget(selector(() => changes++, (_) async { submissions++; return 'Synthetic interrupted response'; }));
    await tester.pumpAndSettle();
    final button = find.byKey(const Key('continue-vehicle-button'));
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pumpAndSettle();
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(submissions, 2);
    expect(changes, 0);
  });
  testWidgets('category A to B to A starts two new intents rather than reviving A', (tester) async {
    await phoneViewport(tester);
    var changes = 0;
    await tester.pumpWidget(selector(() => changes++, (_) async => null));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mototáxi'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Carro normal'));
    await tester.pumpAndSettle();
    expect(changes, 2);
  });
  testWidgets('changing passenger count is a new explicit intent', (tester) async {
    await phoneViewport(tester);
    var changes = 0;
    await tester.pumpWidget(selector(() => changes++, (_) async => null));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byTooltip('Adicionar passageiro'));
    await tester.tap(find.byTooltip('Adicionar passageiro'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    expect(changes, 1);
  });
  testWidgets('selection cannot change while the existing HTTP attempt is pending', (tester) async {
    await phoneViewport(tester);
    var changes = 0;
    final pending = Completer<String?>();
    await tester.pumpWidget(selector(() => changes++, (_) => pending.future));
    await tester.pumpAndSettle();
    final button = find.byKey(const Key('continue-vehicle-button'));
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pump();
    await tester.drag(find.byType(Scrollable).first, const Offset(0, 500));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.ensureVisible(find.text('Mototáxi'));
    await tester.tap(find.text('Mototáxi'));
    await tester.pump();
    expect(changes, 0);
    pending.complete('Synthetic failure');
    await tester.pumpAndSettle();
  });
}
