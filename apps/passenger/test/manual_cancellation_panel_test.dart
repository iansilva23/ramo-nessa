import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/passenger_cancellation_panel.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/passenger_ride_tracking_service.dart';
class _Api implements PassengerManualCancellationApi{
 late DateTime now;final accepted=DateTime.utc(2026,10,24,1);bool enabled=true;
 @override Future<Map<String,dynamic>> cancellationRequest(String rideId,{String method='GET',Map<String,dynamic>? body,bool pix=false})async=> {
  'canCancel':true,'cancellation':null,
  'terms':{'systemEnabled':enabled,'cancelUntil':accepted.add(const Duration(seconds:40)).toIso8601String(),'serverTime':now.toIso8601String()}};
}
void main(){
 testWidgets('disabled system leaves no button or gap; ADM activation and deactivation update the panel',(tester)async{
  final api=_Api()..enabled=false;api.now=api.accepted;
  await tester.pumpWidget(MaterialApp(home:Scaffold(body:Align(alignment:Alignment.bottomCenter,child:Column(mainAxisSize:MainAxisSize.min,children:[
   const Text('João Silva',key:ValueKey('name')),
   PassengerCancellationPanel(rideId:'ride',api:api,onChanged:(){},now:()=>api.now),
  ])))));
  await tester.pump();await tester.pump(const Duration(milliseconds:300));
  expect(find.byKey(const ValueKey('passenger-free-cancel')),findsNothing);
  final disabledY=tester.getTopLeft(find.byKey(const ValueKey('name'))).dy;
  api.enabled=true;
  await tester.pump(const Duration(seconds:10));await tester.pump();await tester.pump(const Duration(milliseconds:300));
  expect(find.byKey(const ValueKey('passenger-free-cancel')),findsOneWidget);
  expect(tester.getTopLeft(find.byKey(const ValueKey('name'))).dy,lessThan(disabledY));
  api.enabled=false;
  await tester.pump(const Duration(seconds:10));await tester.pump();await tester.pump(const Duration(milliseconds:300));
  expect(find.byKey(const ValueKey('passenger-free-cancel')),findsNothing);
  expect(tester.getTopLeft(find.byKey(const ValueKey('name'))).dy,disabledY);
  expect(tester.takeException(),isNull);
  await tester.pumpWidget(const SizedBox());
 });
 testWidgets('40-second button disappears and bottom panel closes smoothly without an empty gap',(tester)async{
  final api=_Api();var now=api.accepted;api.now=now;
  await tester.pumpWidget(MaterialApp(home:Scaffold(body:Column(children:[
   const Expanded(child:SizedBox()),
   SizedBox(key:const ValueKey('card'),width:double.infinity,child:Column(mainAxisSize:MainAxisSize.min,children:[
    const Text('João Silva',key:ValueKey('driver-name')),
    PassengerCancellationPanel(rideId:'ride',api:api,onChanged:(){},now:()=>now),
   ])),
  ]))));
  await tester.pump();await tester.pump(const Duration(milliseconds:300));
  expect(find.byKey(const ValueKey('passenger-free-cancel')),findsOneWidget);
  final nameBefore=tester.getTopLeft(find.byKey(const ValueKey('driver-name'))).dy;
  final bottomBefore=tester.getBottomLeft(find.byKey(const ValueKey('card'))).dy;
  now=now.add(const Duration(seconds:39));api.now=now;
  await tester.pump(const Duration(seconds:1));
  expect(find.text('Cancelar gratuitamente · 1s'),findsOneWidget);
  now=now.add(const Duration(seconds:1));api.now=now;
  await tester.pump(const Duration(seconds:1));
  await tester.pump(const Duration(milliseconds:300));
  expect(find.byKey(const ValueKey('passenger-free-cancel')),findsNothing);
  expect(tester.getTopLeft(find.byKey(const ValueKey('driver-name'))).dy,greaterThan(nameBefore));
  expect(tester.getBottomLeft(find.byKey(const ValueKey('card'))).dy,bottomBefore);
  expect(tester.takeException(),isNull);
  await tester.pumpWidget(const SizedBox());
 });
}
