import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'package:ramo_nessa_passenger/src/features/rides/presentation/passenger_boarding_card.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/passenger_cancellation_panel.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/passenger_ride_resume_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/passenger_ride_tracking_service.dart';

const captureKey = Key('secondary-capture');
Future<void> loadFonts() async {
  final candidates = [File('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), File('/System/Library/Fonts/Supplemental/Arial.ttf')];
  for (final file in candidates) {
    if (!file.existsSync()) continue;
    for (final family in ['SecondaryCapture', 'Roboto', 'Ahem', 'sans-serif']) {
      final loader = FontLoader(family)
        ..addFont(Future.value(ByteData.sublistView(file.readAsBytesSync())));
      await loader.load();
    }
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

class _Boarding implements PassengerBoardingApi {
 _Boarding(this.blocked);final bool blocked;
 @override Future<Map<String,dynamic>> boardingStatus(String rideId) async => {'required':true,'code':'007','blocked':blocked};
}
class _Cancel implements PassengerManualCancellationApi {
 _Cancel(this.status);final String status;
 final now=DateTime.utc(2026,11,5);
 @override Future<Map<String,dynamic>> cancellationRequest(String rideId,{String method='GET',Map<String,dynamic>? body,bool pix=false}) async => {
 'canCancel': status=='active',
 'terms':{'systemEnabled':true,'cancelUntil':now.add(const Duration(seconds:40)).toIso8601String(),'serverTime':now.toIso8601String()},
 'cancellation':status=='active'?null:{'status':status,'refundCents':15000,'feeCents':0}};
}
void main() {
 testWidgets('secondary passenger boarding and refund states fit enlarged text', (tester) async {
  tester.view.devicePixelRatio=1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.runAsync(loadFonts);
  for(final dark in [false,true]) {
   tester.view.physicalSize=Size(dark?1000:320,dark?900:740);
   final variant=dark?'desktop-dark':'phone';
   for(final blocked in [false,true]) {
    await tester.pumpWidget(host(Scaffold(body:SingleChildScrollView(padding:const EdgeInsets.all(20),child:
      PassengerBoardingCard(key:ValueKey(blocked),api:_Boarding(blocked),rideId:'synthetic',delivery:false))),dark));
    await tester.pump();
    await tester.pump(const Duration(milliseconds:350));
    await tester.pump(const Duration(milliseconds:350));
    expect(find.text('007'),findsOneWidget);
    await capture(tester,'passenger','boarding-$blocked-$variant');
    await tester.pumpWidget(const SizedBox.shrink());
   }
   for(final status in ['active','awaiting_pix','approved','refunded']) {
    final api=_Cancel(status);
    await tester.pumpWidget(host(Scaffold(body:SingleChildScrollView(padding:const EdgeInsets.all(20),child:
      PassengerCancellationPanel(key:ValueKey(status),api:api,rideId:'synthetic',onChanged:(){},now:()=>api.now))),dark));
    await tester.pump();
    await tester.pump(const Duration(milliseconds:350));
    await tester.pump(const Duration(milliseconds:350));
    if(status=='awaiting_pix') {
      await tester.scrollUntilVisible(find.text('Salvar dados para devolução'),180,scrollable:find.byType(Scrollable).first);
      await tester.pump();
    await tester.pump(const Duration(milliseconds:350));
    await tester.pump(const Duration(milliseconds:350));
    }
    await capture(tester,'passenger','cancel-$status-$variant');
    if(status=='active') {
     await tester.ensureVisible(find.byKey(const ValueKey('passenger-free-cancel')));
     await tester.pump(const Duration(milliseconds:350));
     await tester.tap(find.byKey(const ValueKey('passenger-free-cancel')));
     await tester.pump();
    await tester.pump(const Duration(milliseconds:350));
    await tester.pump(const Duration(milliseconds:350));
     expect(find.text('Cancelar corrida?'),findsOneWidget);
     await capture(tester,'passenger','cancel-confirm-$variant');
    }
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
   }
  }
 });
}
