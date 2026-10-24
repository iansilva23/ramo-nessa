import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/http_passenger_ride_tracking_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/passenger_ride_resume_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/ride_recovery_gate.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/passenger_boarding_card.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/resumed_ride_screen.dart';

class ResumeFixture implements PassengerRideResumeService {
 Map<String,dynamic> value={'ride':null};bool fail=false;int calls=0;
 @override Future<Map<String,dynamic>> resumeRide({String? lastRideId}) async {calls++;if(fail)throw Exception('offline');return value;}
}
class BoardingFixture implements PassengerBoardingApi {
 Map<String,dynamic> value={'required':false};
 @override Future<Map<String,dynamic>> boardingStatus(String rideId) async=>value;
}
void main(){
 setUp(() => FlutterSecureStorage.setMockInitialValues({}));
 test('malformed recovery responses never mean that there is no active ride',() async {
  for(final payload in [{}, {'ride':[]}, {'ride':{'id':'ride'}}, {'ride':'invalid'}]){
   final service=HttpPassengerRideTrackingService(baseUrl:Uri.parse('https://test.invalid'),accessToken:'secret',
    client:MockClient((_)async=>http.Response(jsonEncode(payload),200)));
   await expectLater(service.resumeRide(),throwsException);
  }
 });
 testWidgets('foreground checks restore a ride after the initial empty result',(tester)async {
  final service=ResumeFixture();
  await tester.pumpWidget(MaterialApp(home:RideRecoveryGate(service:service,child:const Text('Mapa inicial'),rideBuilder:(data,close)=>Text('Recuperada ${data['ride']['id']}'))));
  await tester.pumpAndSettle();expect(find.text('Mapa inicial'),findsOneWidget);
  service.value={'ride':{'id':'foreground-ride','state':'IN_PROGRESS'}};
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
  await tester.pumpAndSettle();expect(find.text('Recuperada foreground-ride'),findsOneWidget);expect(service.calls,2);
  await tester.pumpWidget(const SizedBox());
 });
 testWidgets('pending recovery is read only and foreground data restores the existing Pix',(tester)async {
  String? copied;
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform,(call)async{
   if(call.method=='Clipboard.setData')copied=(call.arguments as Map)['text'] as String;
   return null;
  });
  addTearDown(()=>tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform,null));
  final requests=<http.Request>[];
  final tracking=HttpPassengerRideTrackingService(baseUrl:Uri.parse('https://test.invalid'),accessToken:'secret',client:MockClient((r)async{
   requests.add(r);
   return http.Response(jsonEncode({'ride':{'id':'ride','state':'AWAITING_PAYMENT','category':'moto'},'payment':{'id':'same-payment','status':'pending','amountCents':1200}}),200);
  }));
  final data=<String,dynamic>{'ride':{'id':'ride','state':'AWAITING_PAYMENT','paymentExpiresAt':DateTime.now().add(const Duration(minutes:10)).toIso8601String()},
   'payment':{'id':'same-payment','status':'pending','amountCents':1200}};
  Widget screen(Map<String,dynamic> value)=>MaterialApp(home:ResumedRideScreen(data:value,onClose:(){},tracking:tracking,payments:null,networkTilesEnabled:false));
  await tester.pumpWidget(screen(data));await tester.pump();
  expect(find.text('Recuperando pagamento'),findsOneWidget);
  final restored={...data,'pix':{'payment':{'id':'same-payment','status':'pending'},'pix':{'orderId':'same-order','paymentId':'same-gateway-payment','qrCode':'existing-copy-code','qrCodeBase64':''}}};
  await tester.pumpWidget(screen(restored));await tester.pump();await tester.pump(const Duration(milliseconds:300));
  expect(find.text('Copiar código Pix'),findsOneWidget);
  await tester.tap(find.text('Copiar código Pix'));await tester.pump();await tester.pump(const Duration(milliseconds:300));
  expect(copied,'existing-copy-code');
  expect(requests,isNotEmpty);expect(requests.every((r)=>r.method=='GET'),isTrue);
  await tester.pumpWidget(const SizedBox());
 });
 test('recovery and boarding use authenticated GET and preserve leading zeroes',() async{
  final requests=<http.Request>[];
  final service=HttpPassengerRideTrackingService(baseUrl:Uri.parse('https://test.invalid'),accessToken:'secret',client:MockClient((r)async{requests.add(r);return http.Response(jsonEncode(r.url.path.endsWith('/boarding')?{'required':true,'code':'007','remainingAttempts':5}:{'ride':{'id':'ride','state':'IN_PROGRESS'}}),200);}));
  expect((await service.resumeRide(lastRideId:'ride'))['ride']['state'],'IN_PROGRESS');
  expect((await service.boardingStatus('ride'))['code'],'007');
  for(final request in requests){expect(request.method,'GET');expect(request.headers['authorization'],'Bearer secret');expect(request.url.toString(),isNot(contains('secret')));}
 });
 testWidgets('cold reopening restores the current server state instead of the home map',(tester)async{
  final service=ResumeFixture()..value={'ride':{'id':'same-ride','state':'IN_PROGRESS'}};
  await tester.pumpWidget(MaterialApp(home:RideRecoveryGate(service:service,child:const Text('Mapa inicial'),rideBuilder:(data,close)=>Text('Recuperada ${data['ride']['id']} ${data['ride']['state']}'))));
  await tester.pumpAndSettle();expect(find.text('Mapa inicial'),findsNothing);expect(find.text('Recuperada same-ride IN_PROGRESS'),findsOneWidget);
  await tester.pumpWidget(const SizedBox());
 });
 testWidgets('offline reopening blocks a new ride and retries without creating a ride',(tester)async{
  final service=ResumeFixture()..fail=true;
  await tester.pumpWidget(MaterialApp(home:RideRecoveryGate(service:service,child:const Text('Mapa inicial'),rideBuilder:(data,close)=>const Text('Corrida'))));
  await tester.pump();await tester.pump(const Duration(milliseconds:10));expect(find.text('Mapa inicial'),findsNothing);expect(find.textContaining('Reconectando'),findsOneWidget);
  service.fail=false;await tester.tap(find.text('Tentar novamente'));await tester.pumpAndSettle();expect(find.text('Mapa inicial'),findsOneWidget);expect(service.calls,2);
  await tester.pumpWidget(const SizedBox());
 });
 testWidgets('disabled boarding leaves no card or empty gap and enabled boarding shows the same code',(tester)async{
  final api=BoardingFixture();
  await tester.pumpWidget(MaterialApp(home:PassengerBoardingCard(api:api,rideId:'ride',delivery:false)));await tester.pump();expect(find.text('Código de embarque'),findsNothing);
  await tester.pumpWidget(const SizedBox());api.value={'required':true,'code':'007','remainingAttempts':5};
  await tester.pumpWidget(MaterialApp(home:PassengerBoardingCard(api:api,rideId:'ride',delivery:true)));await tester.pump();expect(find.text('Código de coleta'),findsOneWidget);expect(find.text('007'),findsOneWidget);
  await tester.pumpWidget(const SizedBox());
 });
}
