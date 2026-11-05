import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'package:ramo_nessa_driver/src/features/home/presentation/boarding_code_dialog.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/passenger_rating_sheet.dart';
import 'package:ramo_nessa_driver/src/features/home/data/passenger_rating_api.dart';

const captureKey = Key('secondary-capture');
Future<void> loadFonts() async {
  final candidates = [File('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), File('/System/Library/Fonts/Supplemental/Arial.ttf')];
  for (final file in candidates) {
    if (!file.existsSync()) continue;
    final loader = FontLoader('SecondaryCapture')
      ..addFont(Future.value(ByteData.sublistView(file.readAsBytesSync())));
    await loader.load();
    break;
  }
  final root = Platform.environment['FLUTTER_ROOT'];
  if (root != null) {
    final file = File('$root/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
    if (file.existsSync()) {
      final loader = FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(file.readAsBytesSync())));
      await loader.load();
    }
  }
}
Future<void> capture(WidgetTester tester, String role, String name) async {
  expect(tester.takeException(), isNull, reason: name);
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(find.byKey(captureKey));
    final picture = await boundary.toImage(pixelRatio: 1);
    final bytes = await picture.toByteData(format: ui.ImageByteFormat.png);
    final file = File('../../release/access-shots/$role-secondary-$name.png');
    file.parent.createSync(recursive: true);
    file.writeAsBytesSync(bytes!.buffer.asUint8List());
    picture.dispose();
  });
}
Widget host(Widget child, bool dark, {double keyboard = 0}) => RepaintBoundary(
 key: captureKey,
 child: MaterialApp(
  debugShowCheckedModeBanner: false,
  theme: (dark ? RamoTheme.dark : RamoTheme.light).copyWith(
    textTheme: (dark ? RamoTheme.dark : RamoTheme.light).textTheme.apply(fontFamily: 'SecondaryCapture')),
  builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(dark ? 1 : 1.4),viewInsets: EdgeInsets.only(bottom: keyboard)),child: child!),
  home: child));


class _RatingApi extends Fake implements DriverPassengerRatingApi {
 _RatingApi(this.state);
 final String state;
 @override Future<DriverPassengerRating?> passengerRating(String rideId) async {
  if (state == 'error') throw Exception('synthetic');
  if (state == 'stored') return const DriverPassengerRating(stars: 5, reasons: ['polite'], comment: 'Teste de apresentação');
  return null;
 }
}
void main() {
 testWidgets('secondary driver dialogs remain usable on narrow and dark views', (tester) async {
  tester.view.devicePixelRatio=1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.runAsync(loadFonts);
  for (final dark in [false,true]) {
   tester.view.physicalSize=Size(dark ? 1000 : 320, dark ? 900 : 740);
   final variant=dark?'desktop-dark':'phone';
   for (final delivery in [false,true]) {
    await tester.pumpWidget(host(Scaffold(body:Builder(builder:(context)=>TextButton(
      onPressed:()=>showDialog<String>(context:context,builder:(_)=>BoardingCodeDialog(delivery:delivery,remainingAttempts:1)),
      child:const Text('Abrir')))),dark,keyboard:dark?0:220));
    await tester.tap(find.text('Abrir'));
    await tester.pumpAndSettle();
    expect(find.textContaining('1 tentativas'), findsOneWidget);
    await tester.enterText(find.byType(TextField),'007');
    await tester.pump();
    await capture(tester,'driver','boarding-${delivery?'delivery':'ride'}-$variant');
    await tester.ensureVisible(find.text('Validar e iniciar'));
    await tester.tap(find.text('Validar e iniciar'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog),findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
   }
   for (final state in ['empty','stored','error']) {
    await tester.pumpWidget(host(Scaffold(body:Builder(builder:(context)=>TextButton(
     onPressed:()=>showPassengerRatingSheet(context,api:_RatingApi(state),rideId:'synthetic'),child:const Text('Avaliar')))),dark));
    await tester.tap(find.text('Avaliar'));
    await tester.pumpAndSettle();
    if(state=='stored') {
     await tester.scrollUntilVisible(find.text('Avaliação registrada. Obrigado!'),180,scrollable:find.byType(Scrollable).last);
    }
    if(state=='error') {
     await tester.scrollUntilVisible(find.text('Tentar novamente'),180,scrollable:find.byType(Scrollable).last);
    }
    await capture(tester,'driver','rating-$state-$variant');
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
   }
  }
 });
}
