import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_models.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/widgets/driver_campaign_notice.dart';

void main() {
  const full = DriverCampaignPresentation(tag: 'influencer', label: 'Influenciador parceiro',
    partnerName: 'Parceiro Jeri', message: 'Obrigado por participar!', animation: 'flash');
  testWidgets('oferta mostra só tag; aceite mostra nome e mensagem sem bloquear ação', (tester) async {
    Widget app(bool compact, {bool reduce = false}) => MaterialApp(home: MediaQuery(
      data: MediaQueryData(disableAnimations: reduce), child: Scaffold(body: Column(children: [
        DriverCampaignNotice(presentation: full, compact: compact, celebrateUntil: DateTime.now().add(const Duration(seconds: 2))),
        ElevatedButton(onPressed: () {}, child: const Text('Cheguei')),
      ]))));
    await tester.pumpWidget(app(true));
    expect(find.text('Influenciador parceiro'), findsOneWidget);
    expect(find.text('Parceiro Jeri'), findsNothing);
    expect(find.text('Obrigado por participar!'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpWidget(app(false));
    expect(find.text('Parceiro Jeri'), findsOneWidget);
    expect(find.text('Obrigado por participar!'), findsOneWidget);
    await tester.tap(find.text('Cheguei'));
    await tester.pump(const Duration(seconds: 3));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpWidget(app(false, reduce: true));
    expect(tester.binding.hasScheduledFrame, isFalse);
    expect(find.text('Obrigado por participar!'), findsOneWidget);
  });
  test('ofertas de servidor anterior continuam sem apresentação', () {
    final presentation = DriverCampaignPresentation.fromJson({'tag':'sponsored','label':'Corrida patrocinada'});
    expect(presentation.message, isNull);
    expect(presentation.animation, 'none');
  });
}
