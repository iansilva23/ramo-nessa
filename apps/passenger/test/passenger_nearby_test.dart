import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/home/data/passenger_nearby_service.dart';

const center = LatLng(-2.82017,-40.41467);
const vehicle = PassengerNearbyVehicle(id:'aaaaaaaaaaaaaaaaaaaaaaaa',category:'moto',position:center);
class NearbyFixture extends PassengerNearbyService {
  final requests = <Completer<PassengerNearbySnapshot>>[];
  bool closed = false;
  @override
  Future<PassengerNearbySnapshot> fetch(LatLng center) { final c = Completer<PassengerNearbySnapshot>(); requests.add(c); return c.future; }
  @override
  void close() { closed = true; }
}
void main() {
  test('HTTP uses passenger bearer header, validates category/GPS and keeps tokens out of URLs',() async {
    final client = MockClient((request) async {
      expect(request.url.path,'/v1/passenger/me/nearby-vehicles');
      expect(request.headers['authorization'],'Bearer secret-token');
      expect(request.url.toString(),isNot(contains('secret-token')));
      expect(request.url.queryParameters['latitude'],'-2.820170');
      return http.Response(jsonEncode({'refreshAfterSeconds':8,'vehicles':[{'id':vehicle.id,'category':'moto','latitude':-2.8202,'longitude':-40.4147,'expiresAfterSeconds':15}]}),200);
    });
    final service = HttpPassengerNearbyService(baseUrl:Uri.parse('https://example.invalid'),accessToken:'secret-token',client:client);
    final result = await service.fetch(center);
    expect(result.vehicles.single.category,'moto');service.close();
  });
  test('HTTP rejects expired auth and invalid marker coordinates',() async {
    final expired = HttpPassengerNearbyService(baseUrl:Uri.parse('https://example.invalid'),accessToken:'token',client:MockClient((_) async => http.Response('{}',401)));
    await expectLater(expired.fetch(center),throwsA(isA<NearbyAuthorizationException>()));expired.close();
    final invalid = HttpPassengerNearbyService(baseUrl:Uri.parse('https://example.invalid'),accessToken:'token',client:MockClient((_) async => http.Response(jsonEncode({'vehicles':[{'id':vehicle.id,'category':'car','latitude':999,'longitude':0,'expiresAfterSeconds':15}]}),200)));
    await expectLater(invalid.fetch(center),throwsFormatException);invalid.close();
  });
  testWidgets('polls only active maps; pauses clear markers and late responses cannot revive them',(tester) async {
    final service = NearbyFixture();
    final feed = PassengerNearbyController(service);
    feed.setCenter(center);expect(service.requests,isEmpty);
    feed.setActive(true);expect(service.requests.length,1);
    feed.setActive(false);
    service.requests.first.complete(const PassengerNearbySnapshot(vehicles:[vehicle]));await tester.pump();
    expect(feed.vehicles,isEmpty);
    await tester.pump(const Duration(seconds:30));expect(service.requests.length,1);
    feed.setActive(true);expect(service.requests.length,2);
    service.requests.last.complete(const PassengerNearbySnapshot(vehicles:[vehicle]));await tester.pump();
    expect(feed.vehicles.length,1);
    feed.setActive(false);expect(feed.vehicles,isEmpty);
    feed.dispose();expect(service.closed,isTrue);
  });
  testWidgets('center change ignores old responses and expired markers disappear while network stalls',(tester) async {
    var now = DateTime(2026,10,24);
    final service = NearbyFixture();final feed = PassengerNearbyController(service,now:()=>now);
    feed.setCenter(center);feed.setActive(true);feed.setCenter(const LatLng(-2.83,-40.42));
    service.requests.first.complete(const PassengerNearbySnapshot(vehicles:[vehicle]));await tester.pump();await tester.pump(const Duration(milliseconds:1));
    expect(feed.vehicles,isEmpty);expect(service.requests.length,2);
    service.requests.last.complete(const PassengerNearbySnapshot(vehicles:[vehicle]));await tester.pump();expect(feed.vehicles.length,1);
    now = now.add(const Duration(seconds:16));await tester.pump(const Duration(seconds:16));
    expect(feed.vehicles,isEmpty);feed.dispose();
  });
}
