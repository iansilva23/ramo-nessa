import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/http_passenger_ride_tracking_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/passenger_ride_resume_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/ride_recovery_gate.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/passenger_boarding_card.dart';

class ResumeFixture implements PassengerRideResumeService {
 Map<String,dynamic> value={'ride':null};bool fail=false;int calls=0;
 @override Future<Map<String,dynamic>> resumeRide({String? lastRideId}) async {calls++;if(fail)throw Exception('offline');return value;}
}
class BoardingFixture implements PassengerBoardingApi {
 Map<String,dynamic> value={'required':false};
 @override Future<Map<String,dynamic>> boardingStatus(String rideId) async=>value;
}
void main(){
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
