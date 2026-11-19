import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_api.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_models.dart';
import 'package:ramo_nessa_driver/src/features/profile/presentation/driver_support_screen.dart';

class _SupportApi extends Fake implements DriverApi {
  late Future<DriverSupportSnapshot> Function() load;

  @override
  Future<DriverSupportSnapshot> supportTickets() => load();
}

void main() {
  testWidgets('load failure is retryable and never presented as an empty history',
      (tester) async {
    final api = _SupportApi()..load = () async => throw Exception('offline');
    await tester.pumpWidget(MaterialApp(home: DriverSupportScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Tentar novamente'), 200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Não conseguimos carregar seus chamados agora.'), findsOneWidget);
    expect(find.text('Você ainda não abriu nenhum chamado.'), findsNothing);
    api.load = () async => const DriverSupportSnapshot(tickets: []);
    await tester.tap(find.text('Tentar novamente'));
    await tester.pumpAndSettle();
    expect(find.text('Você ainda não abriu nenhum chamado.'), findsOneWidget);
    expect(find.text('Tentar novamente'), findsNothing);
  });

  testWidgets('older response cannot overwrite the latest refresh', (tester) async {
    final old = Completer<DriverSupportSnapshot>();
    final api = _SupportApi()..load = () => old.future;
    await tester.pumpWidget(MaterialApp(home: DriverSupportScreen(api: api)));
    await tester.pump();
    api.load = () async => const DriverSupportSnapshot(tickets: []);
    await tester.widget<RefreshIndicator>(find.byType(RefreshIndicator)).onRefresh();
    await tester.pumpAndSettle();
    old.completeError(Exception('late failure'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Você ainda não abriu nenhum chamado.'), 200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Você ainda não abriu nenhum chamado.'), findsOneWidget);
    expect(find.text('Tentar novamente'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
