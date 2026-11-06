import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/app.dart';
import 'driver_flow_test.dart' show identityReviewApi,identityReviewLocation;
Future<void> fonts()async{
 final regular=await File('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf').readAsBytes();
 final bold=await File('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf').readAsBytes();
 for(final name in ['Roboto','Inter']){await (FontLoader(name)..addFont(Future.value(ByteData.sublistView(regular)))..addFont(Future.value(ByteData.sublistView(bold)))).load();}
 final root=Platform.environment['FLUTTER_ROOT'];
 if(root!=null){final bytes=await File('$root/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf').readAsBytes();await (FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(bytes)))).load();}
}

void main(){
 TestWidgetsFlutterBinding.ensureInitialized();setUpAll(fonts);
 for(final width in [320,390,900]){
  testWidgets('driver identification visual $width',(tester)async{
   tester.view.physicalSize=Size(width.toDouble(),900);tester.view.devicePixelRatio=1;
   addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
   await tester.pumpWidget(RepaintBoundary(key:const Key('capture'),child:RamoNessaDriverApp(api:identityReviewApi(),locationService:identityReviewLocation())));
   await tester.pump();await tester.pump(const Duration(milliseconds:800));
   final expand=find.byTooltip('Expandir corrida');if(expand.evaluate().isNotEmpty){await tester.tap(expand);await tester.pump(const Duration(milliseconds:500));}
   await tester.pump(const Duration(milliseconds:500));
   expect(find.text('Ian Silva'),findsOneWidget);expect(tester.takeException(),isNull);
   await expectLater(find.byKey(const Key('capture')),matchesGoldenFile('../ride-identity-artifacts/driver-$width.png'));
   await tester.pumpWidget(const SizedBox());
  });
 }
}
