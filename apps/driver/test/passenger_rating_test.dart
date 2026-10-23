import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_api.dart';
import 'package:ramo_nessa_driver/src/features/home/data/passenger_rating_api.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/passenger_rating_sheet.dart';

class _Api implements DriverPassengerRatingApi {
  DriverPassengerRating? stored;
  bool fail = false;
  Completer<DriverPassengerRating>? pending;
  int calls = 0;
  @override
  Future<DriverPassengerRating?> passengerRating(String rideId) async => stored;
  @override
  Future<DriverPassengerRating> ratePassenger({
    required String rideId,
    required int stars,
    required List<String> reasons,
    String? comment,
  }) async {
    calls++;
    if (fail) {
      throw const DriverApiException('Falha de teste. Tente novamente.');
    }
    if (pending != null) return pending!.future;
    return stored ??= DriverPassengerRating(
      stars: stars,
      reasons: reasons,
      comment: comment,
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    if (Platform.environment['RAMO_RATING_CAPTURE'] != 'true') return;
    final file = File('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
    if (file.existsSync()) {
      final font = FontLoader('Roboto')
        ..addFont(Future.value(ByteData.sublistView(file.readAsBytesSync())));
      await font.load();
    }
  });

  Future<void> open(
    WidgetTester tester,
    _Api api, {
    Size size = const Size(390, 960),
    double keyboard = 0,
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      RepaintBoundary(
        key: const Key('rating-review-boundary'),
        child: MaterialApp(
          theme: RamoTheme.light,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(viewInsets: EdgeInsets.only(bottom: keyboard)),
            child: child!,
          ),
          home: Builder(
            builder: (context) => Scaffold(
              backgroundColor: const Color(0xFFDCE7E5),
              body: Center(
                child: TextButton(
                  onPressed: () => showPassengerRatingSheet(
                    context,
                    api: api,
                    rideId: 'ride',
                  ),
                  child: const Text('Abrir avaliação'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Abrir avaliação'));
    await tester.pumpAndSettle();
  }

  Future<void> capture(WidgetTester tester, String name) async {
    if (Platform.environment['RAMO_RATING_CAPTURE'] != 'true') return;
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(const Key('rating-review-boundary')),
    );
    await tester.runAsync(() async {
      final image = await boundary.toImage(pixelRatio: 2);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      final file = File('build/passenger-rating-review/$name.png');
      await file.parent.create(recursive: true);
      await file.writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
    });
  }

  testWidgets(
    'reference form requires a star, saves reasons and comment, then shows persisted result',
    (tester) async {
      final api = _Api();
      await open(tester, api);
      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const Key('confirm-passenger-rating')),
            )
            .onPressed,
        isNull,
      );
      await tester.tap(find.byKey(const ValueKey('passenger-rating-star-4')));
      expect(find.text('Muito bom'), findsOneWidget);
      await tester.tap(find.text('Educado'));
      await tester.tap(find.text('Boa comunicação'));
      await tester.ensureVisible(
        find.byKey(const Key('passenger-rating-comment')),
      );
      await tester.enterText(
        find.byKey(const Key('passenger-rating-comment')),
        'Muito educado',
      );
      await tester.pumpAndSettle();
      await capture(tester, 'rating-selected-390');
      await tester.tap(find.text('Confirmar avaliação'));
      await tester.pumpAndSettle();
      expect(api.calls, 1);
      expect(api.stored!.stars, 4);
      expect(api.stored!.reasons, ['polite', 'communication']);
      expect(api.stored!.comment, 'Muito educado');
      expect(find.text('Avaliação registrada. Obrigado!'), findsOneWidget);
      expect(find.text('Confirmar avaliação'), findsNothing);
      await tester.tap(find.text('Voltar para o mapa'));
      await tester.pumpAndSettle();
      expect(find.text('Avaliar passageiro'), findsNothing);
    },
  );

  testWidgets('Agora não never writes a rating', (tester) async {
    final api = _Api();
    await open(tester, api);
    await tester.tap(find.text('Agora não'));
    await tester.pumpAndSettle();
    expect(api.calls, 0);
    expect(api.stored, isNull);
  });

  testWidgets(
    'failed save preserves choices and retry cannot submit twice while pending',
    (tester) async {
      final api = _Api()..fail = true;
      await open(tester, api);
      await tester.tap(find.byKey(const ValueKey('passenger-rating-star-5')));
      await tester.tap(find.text('Pontual'));
      await tester.tap(find.text('Confirmar avaliação'));
      await tester.pumpAndSettle();
      expect(find.text('Excelente'), findsOneWidget);
      expect(
        tester
            .widget<FilterChip>(find.widgetWithText(FilterChip, 'Pontual'))
            .selected,
        isTrue,
      );
      api.fail = false;
      api.pending = Completer<DriverPassengerRating>();
      await tester.tap(find.text('Confirmar avaliação'));
      await tester.pump();
      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const Key('confirm-passenger-rating')),
            )
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<OutlinedButton>(
              find.widgetWithText(OutlinedButton, 'Agora não'),
            )
            .onPressed,
        isNull,
      );
      expect(api.calls, 2);
      api.pending!.complete(
        const DriverPassengerRating(stars: 5, reasons: ['punctual']),
      );
      await tester.pumpAndSettle();
      expect(find.text('Voltar para o mapa'), findsOneWidget);
    },
  );

  testWidgets(
    'an existing rating is shown read-only and is never overwritten',
    (tester) async {
      final api = _Api()
        ..stored = const DriverPassengerRating(
          stars: 4,
          reasons: ['polite'],
          comment: 'Registrado',
        );
      await open(tester, api);
      expect(find.text('Confirmar avaliação'), findsNothing);
      expect(
        tester
            .widget<IconButton>(
              find.byKey(const ValueKey('passenger-rating-star-1')),
            )
            .onPressed,
        isNull,
      );
      expect(api.calls, 0);
    },
  );

  for (final entry in [
    (const Size(320, 568), 0.0),
    (const Size(390, 844), 300.0),
    (const Size(560, 360), 180.0),
  ]) {
    testWidgets('responsive rating ${entry.$1} keyboard ${entry.$2}', (
      tester,
    ) async {
      await open(tester, _Api(), size: entry.$1, keyboard: entry.$2);
      expect(tester.takeException(), isNull);
      await capture(
        tester,
        'rating-${entry.$1.width.toInt()}-${entry.$1.height.toInt()}',
      );
      await tester.pumpWidget(const SizedBox());
    });
  }
}
