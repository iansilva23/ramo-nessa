import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/vehicle_selection_screen.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/domain/pricing_quote.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/pricing_quote_service.dart';

PricingQuote price(int cents) => PricingQuote.fromJson({
      'kind': 'exact',
      'ruleId': 'test-rule',
      'totalAmountCents': cents,
    });

Widget screen({
  required Future<PricingQuote> Function(VehicleSelectionResult) quote,
  List<ServiceType> services = const [ServiceType.car, ServiceType.moto],
  Future<String?> Function(VehicleSelectionResult)? onContinue,
}) => MaterialApp(
      home: VehicleSelectionScreen(
        originLabel: 'Preá',
        destinationLabel: 'Centro',
        routeSummary: '2 km · 5 min',
        availableServices: services,
        initialService: services.first,
        buggyMinPassengers: 1,
        buggyMaxPassengers: 4,
        onQuote: quote,
        onContinue: onContinue ?? (_) async => null,
      ),
    );

void main() {
  testWidgets('sem tarifa confirmada não permite iniciar uma corrida', (tester) async {
    final pending = Completer<PricingQuote>();
    var continued = 0;
    await tester.pumpWidget(screen(
      quote: (_) => pending.future,
      services: const [ServiceType.car],
      onContinue: (_) async { continued++; return null; },
    ));
    await tester.pump();
    expect(tester.widget<FilledButton>(find.byKey(const Key('continue-vehicle-button'))).onPressed, isNull);
    pending.complete(price(13000));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.byKey(const Key('continue-vehicle-button'))).onPressed, isNotNull);
    expect(continued, 0);
  });

  testWidgets('oculta apenas categoria rejeitada pelo Core e permite a tarifada', (tester) async {
    await tester.pumpWidget(screen(
      services: const [ServiceType.car, ServiceType.moto],
      quote: (selection) async {
        if (selection.service == ServiceType.car) {
          throw const PricingQuoteException('Sem tarifa', code: 'UNAVAILABLE_CATEGORY');
        }
        return price(6000);
      },
    ));
    await tester.pumpAndSettle();
    expect(find.text('Carro normal'), findsNothing);
    expect(find.text('Mototáxi'), findsOneWidget);
    expect(find.text(r'R$ 60,00'), findsOneWidget);
    expect(find.byKey(const Key('hidden-unpriced-categories')), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('continue-vehicle-button'))).onPressed, isNotNull);
  });

  testWidgets('quando todas as categorias são rejeitadas, não há avanço', (tester) async {
    await tester.pumpWidget(screen(
      quote: (_) async => throw const PricingQuoteException(
        'Rota sem tarifa', code: 'UNKNOWN_ROUTE'),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('no-priced-vehicle-message')), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('continue-vehicle-button'))).onPressed, isNull);
  });

  testWidgets('mostra preços de todas as categorias sem preparar corrida',
      (tester) async {
    final requests = <VehicleSelectionResult>[];
    var preparations = 0;
    await tester.pumpWidget(screen(
      quote: (selection) async {
        requests.add(selection);
        return price(selection.service == ServiceType.moto ? 700 : 2500);
      },
      onContinue: (_) async {
        preparations++;
        return null;
      },
    ));
    await tester.pumpAndSettle();
    expect(find.text(r'R$ 7,00'), findsOneWidget);
    expect(find.text(r'R$ 25,00'), findsOneWidget);
    expect(requests.map((request) => request.service),
        containsAll([ServiceType.car, ServiceType.moto]));
    expect(preparations, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets('resposta antiga não substitui preço dos passageiros atuais',
      (tester) async {
    final original = Completer<PricingQuote>();
    final passengers = <int>[];
    await tester.pumpWidget(screen(
      services: const [ServiceType.car],
      quote: (selection) {
        passengers.add(selection.passengerCount);
        return selection.passengerCount == 1
            ? original.future
            : Future.value(price(2700));
      },
    ));
    await tester.pumpAndSettle();
    expect(find.text('Calculando…'), findsOneWidget);
    await tester.tap(find.byTooltip('Adicionar passageiro'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    expect(passengers, [1, 2]);
    expect(find.text(r'R$ 27,00'), findsOneWidget);
    original.complete(price(2500));
    await tester.pumpAndSettle();
    expect(find.text(r'R$ 27,00'), findsOneWidget);
    expect(find.text(r'R$ 25,00'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('falha de uma categoria preserva as demais e permite tentar de novo',
      (tester) async {
    var fail = true;
    await tester.pumpWidget(screen(quote: (selection) async {
      if (selection.service == ServiceType.car && fail) {
        throw Exception('offline');
      }
      return price(selection.service == ServiceType.car ? 2500 : 700);
    }));
    await tester.pumpAndSettle();
    expect(find.text('Falha na cotação'), findsOneWidget);
    expect(find.text(r'R$ 7,00'), findsOneWidget);
    fail = false;
    await tester.scrollUntilVisible(
      find.text('Atualizar preços'),
      150,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Atualizar preços'));
    await tester.pumpAndSettle();
    expect(find.text(r'R$ 25,00'), findsOneWidget);
    expect(find.text('Falha na cotação'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
