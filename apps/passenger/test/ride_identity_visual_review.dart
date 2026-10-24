import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/passenger_ride_tracking_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/domain/passenger_ride_tracking_snapshot.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/ride_tracking_screen.dart';
Future<void> fonts()async{
 final regular=await File('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf').readAsBytes();
 final bold=await File('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf').readAsBytes();
 for(final name in ['Roboto','Inter']){await (FontLoader(name)..addFont(Future.value(ByteData.sublistView(regular)))..addFont(Future.value(ByteData.sublistView(bold)))).load();}
 final root=Platform.environment['FLUTTER_ROOT'];
 if(root!=null){final bytes=await File('$root/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf').readAsBytes();await (FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(bytes)))).load();}
}

class _Tracking implements PassengerRideTrackingService,PassengerManualCancellationApi{
 @override dynamic noSuchMethod(Invocation invocation)=>throw UnimplementedError();
 @override Future<PassengerRideTrackingSnapshot> tracking(String id)async=>const PassengerRideTrackingSnapshot(
  rideId:'ride-1',state:'DRIVER_ARRIVING',category:'comfort_black',pickupLatitude:-2.82,pickupLongitude:-40.41,
  driver:PassengerDriverProfile(id:'driver-1',displayName:'João Silva',ratingCount:25,ratingAverage:4.9,
   vehicleMake:'Toyota',vehicleModel:'Hilux',vehicleColor:'Prata',vehiclePlate:'ABC1D23'));
 @override Future<Map<String,dynamic>> cancellationRequest(String rideId,{String method='GET',Map<String,dynamic>? body,bool pix=false})async=>{
  'canCancel':true,'cancellation':null,'terms':{'serverTime':DateTime.now().toIso8601String(),'cancelUntil':DateTime.now().add(const Duration(seconds:40)).toIso8601String()}};
}
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();setUpAll(fonts);
 for(final width in [320,390,900]){
  testWidgets('passenger identification visual $width',(tester)async{
   tester.view.physicalSize=Size(width.toDouble(),900);tester.view.devicePixelRatio=1;
   addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
   await tester.pumpWidget(MaterialApp(theme:RamoTheme.light,home:RepaintBoundary(key:const Key('capture'),
    child:RideTrackingScreen(rideId:'ride-1',remainingWalletCents:null,trackingService:_Tracking(),networkTilesEnabled:false))));
   await tester.pump();await tester.pump(const Duration(milliseconds:800));
   expect(find.text('ABC1D23'),findsOneWidget);expect(find.text('João Silva'),findsOneWidget);expect(tester.takeException(),isNull);
   await expectLater(find.byKey(const Key('capture')),matchesGoldenFile('../ride-identity-artifacts/passenger-$width.png'));
   await tester.pumpWidget(const SizedBox());
  });
 }
}
