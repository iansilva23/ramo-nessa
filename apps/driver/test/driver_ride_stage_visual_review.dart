import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/app.dart';

import 'driver_flow_test.dart'
    show driverVisualStageApi, identityReviewLocation;
import 'ride_identity_visual_review.dart' show fonts;

/// Linux-only screenshot fixture used for human visual approval. This file is
/// intentionally not named *_test.dart, so normal regression runs remain pure.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(fonts);

  const stages = <String, String>{
    'offer': 'NOVA CORRIDA',
    'AWAITING_PAYMENT': 'Aguardando pagamento do passageiro',
    'DRIVER_ARRIVING': 'Indo buscar passageiro',
    'DRIVER_ARRIVED': 'Você chegou',
    'IN_PROGRESS': 'Corrida em andamento',
    'complete': 'Corrida finalizada',
  };

  for (final width in [320, 390, 900]) {
    for (final entry in stages.entries) {
      testWidgets('visual ${entry.key} on ${width}px', (tester) async {
        tester.view.physicalSize = Size(width.toDouble(), 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await tester.pumpWidget(
          RepaintBoundary(
            key: const ValueKey('capture'),
            child: RamoNessaDriverApp(
              api: driverVisualStageApi(entry.key),
              locationService: identityReviewLocation(),
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 800));

        if (entry.key == 'offer') {
          await tester.tap(find.byKey(const Key('driver-go-online')));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
        } else if (entry.key == 'complete') {
          await tester.tap(find.text('Finalizar corrida'));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
          // Capture the settled completion panel, not its transient snackbar.
          await tester.pump(const Duration(seconds: 5));
          await tester.pump(const Duration(milliseconds: 400));
        }

        final expected = width < 360 && entry.key == 'AWAITING_PAYMENT'
            ? 'Aguardando pagamento'
            : entry.value;
        expect(find.text(expected), findsOneWidget);
        expect(tester.takeException(), isNull);

        await expectLater(
          find.byKey(const ValueKey('capture')),
          matchesGoldenFile(
            '../ride-responsive-artifacts/${entry.key}-$width.png',
          ),
        );
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }
}
