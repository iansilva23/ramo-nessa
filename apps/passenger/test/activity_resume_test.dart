import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/http_passenger_ride_tracking_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/passenger_activity_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/domain/passenger_activity.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/passenger_activity_screen.dart';
import 'package:ramo_nessa_passenger/src/features/profile/data/http_passenger_support_service.dart';

class ActivityFixture implements PassengerActivityService {
  bool fail = false;
  String state = 'DRIVER_ARRIVED';
  @override
  Future<PassengerActivitySnapshot> fetch() async {
    if (fail) throw StateError('offline');
    return PassengerActivitySnapshot.fromJson({
      'summary': {'active': 1},
      'rides': [
        {
          'id': 'ride-one',
          'state': state,
          'category': 'moto',
          'origin': {'zoneId': 'prea'},
          'destination': {'zoneId': 'jijoca'},
          'totalAmountCents': 1250,
          'paymentMethod': 'pix',
          'paymentStatus': 'paid',
          'createdAt': '2026-10-25T14:32:00Z',
          'updatedAt': '2026-10-25T14:38:00Z',
          'driver': {'name': 'João Teste'},
        },
        {
          'id': 'ride-past',
          'state': 'COMPLETED',
          'category': 'moto',
          'origin': {'zoneId': 'prea'},
          'destination': {'zoneId': 'jijoca'},
          'totalAmountCents': 900,
          'createdAt': '2026-10-24T14:32:00Z',
          'updatedAt': '2026-10-24T14:38:00Z',
        },
      ],
    });
  }
}

void main() {
  testWidgets('hidden activities refresh the home callback after driver cancels', (tester) async {
    final service = ActivityFixture();
    PassengerActivitySnapshot? latest;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: PassengerActivityScreen(
      service: service, visible: false, refreshWhenHidden: true,
      onLoaded: (snapshot) => latest = snapshot,
    ))));
    await tester.pumpAndSettle();
    expect(latest!.rides.first.state, 'DRIVER_ARRIVED');
    service.state = 'CANCELLED_BY_DRIVER';
    await tester.pump(const Duration(seconds: 15));
    await tester.pumpAndSettle();
    expect(latest!.rides.first.state, 'CANCELLED_BY_DRIVER');
    expect(find.text('Acompanhar'), findsNothing);
    await tester.tap(find.text('Histórico'));
    await tester.pumpAndSettle();
    expect(find.text('Cancelada pelo motorista'), findsWidgets);
    expect(find.text('Ver pagamento'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'activities resumes only the chosen ride, preserves stale data and separates history',
    (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final service = ActivityFixture();
      String? opened;
      await tester.pumpWidget(
        MaterialApp(
          theme: RamoTheme.light,
          home: Scaffold(
            body: PassengerActivityScreen(
              service: service,
              onResume: (ride) async {
                opened = ride.id;
              },
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(opened, isNull);
      expect(find.text('Pix confirmado'), findsOneWidget);
      await tester.ensureVisible(find.text('Acompanhar'));
      await tester.tap(find.text('Acompanhar'));
      await tester.pumpAndSettle();
      expect(opened, 'ride-one');
      service.fail = true;
      await tester.pump(const Duration(seconds: 15));
      await tester.pump();
      expect(find.text('João Teste'), findsOneWidget);
      expect(find.textContaining('últimos registros'), findsOneWidget);
      await tester.tap(find.text('Histórico'));
      await tester.pumpAndSettle();
      expect(find.text('Ver corrida'), findsOneWidget);
      expect(find.text('Acompanhar'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  test(
    'selected recovery and help use authenticated requests bound to the exact ride',
    () async {
      final requests = <http.Request>[];
      final client = MockClient((r) async {
        requests.add(r);
        if (r.method == 'POST') return http.Response('{}', 201);
        if (r.url.path.endsWith('/support')) {
          return http.Response(
            jsonEncode({
              'tickets': [
                {'rideId': 'selected', 'id': 'ticket'},
              ],
            }),
            200,
          );
        }
        return http.Response(
          jsonEncode({
            'ride': {'id': 'selected', 'state': 'DRIVER_ARRIVED'},
          }),
          200,
        );
      });
      final tracking = HttpPassengerRideTrackingService(
        baseUrl: Uri.parse('https://test.invalid'),
        accessToken: 'session',
        client: client,
      );
      await tracking.resumeSelectedRide('selected');
      expect(requests.single.url.queryParameters['rideId'], 'selected');
      final support = HttpPassengerSupportService(
        baseUrl: Uri.parse('https://test.invalid'),
        accessToken: 'session',
        client: client,
      );
      await support.createRideSupportTicket(
        rideId: 'selected',
        reason: 'Motorista não está no embarque',
        description: '',
      );
      expect(jsonDecode(requests.last.body)['rideId'], 'selected');
      expect(
        jsonDecode(requests.last.body).containsKey('rideContext'),
        isFalse,
      );
      expect(
        (await support.rideSupportTickets('selected')).single['id'],
        'ticket',
      );
      expect(
        requests.every((r) => r.headers['authorization'] == 'Bearer session'),
        isTrue,
      );
    },
  );
  test(
    'selected recovery rejects a mismatching ride instead of opening another payment',
    () async {
      final tracking = HttpPassengerRideTrackingService(
        baseUrl: Uri.parse('https://test.invalid'),
        client: MockClient(
          (r) async => http.Response(
            jsonEncode({
              'ride': {'id': 'wrong', 'state': 'AWAITING_PAYMENT'},
            }),
            200,
          ),
        ),
      );
      await expectLater(
        tracking.resumeSelectedRide('selected'),
        throwsException,
      );
    },
  );
}
