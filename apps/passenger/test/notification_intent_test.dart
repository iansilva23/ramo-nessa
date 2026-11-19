import 'package:flutter/material.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/passenger_main_shell.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/passenger_activity_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/domain/passenger_activity.dart';
import 'package:ramo_nessa_passenger/src/features/tours/data/agency_tour_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_push/ramo_push.dart';

void main() {
  setUp(clearNotificationIntents);
  tearDown(clearNotificationIntents);
  testWidgets('notification opens only a verified ride and routes chat directly', (tester) async {
    const rideId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    String? chat, resumed;
    publishNotificationIntent({'type': 'ride.chat.message', 'rideId': rideId});
    await tester.pumpWidget(MaterialApp(home: PassengerMainShell(
      homeBuilder: (_, __, ___) => const SizedBox(),
      activityService: _Activities(), authService: null, paymentService: null,
      savedPlaceService: null, placeSearchService: null, accessToken: 'session',
      tourService: const PreviewAgencyTourService(),
      onResumeRide: (_, ride) async { resumed = ride.id; },
      onOpenRideChat: (_, id) async { chat = id; },
    )));
    await tester.pumpAndSettle();
    expect(chat, rideId);
    expect(resumed, isNull);
    publishNotificationIntent({'type': 'passenger.ride.updated', 'rideId': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});
    await tester.pumpAndSettle();
    expect(resumed, isNull);
    publishNotificationIntent({'type': 'passenger.payment.failed', 'rideId': rideId});
    await tester.pumpAndSettle();
    expect(resumed, rideId);
    await tester.pumpWidget(const SizedBox());
  });
  test('cold start retains one notification, rejects invalid data and clears on logout', () {
    publishNotificationIntent({'type': 'passenger.payment.failed', 'rideId': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}, messageId: 'one');
    final pending = takePendingNotificationIntent();
    expect(pending?.isRide, isTrue);
    expect(pending?.rideId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(takePendingNotificationIntent(), isNull);
    publishNotificationIntent({'type': 'passenger.payment.failed'}, messageId: 'one');
    expect(takePendingNotificationIntent(), isNull);
    publishNotificationIntent({'type': 'https://evil.example'});
    expect(takePendingNotificationIntent(), isNull);
    publishNotificationIntent({'type': 'ride.chat.message', 'rideId': 'invalid'});
    expect(takePendingNotificationIntent()?.rideId, isNull);
    publishNotificationIntent({'type': 'driver.offer.new'});
    clearNotificationIntents();
    expect(takePendingNotificationIntent(), isNull);
  });
}

class _Activities implements PassengerActivityService {
  @override
  Future<PassengerActivitySnapshot> fetch() async => PassengerActivitySnapshot.fromJson({
    'summary': {'active': 1}, 'rides': [{
      'id': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'state': 'DRIVER_ARRIVED',
      'category': 'moto', 'origin': {'zoneId': 'prea'}, 'destination': {'zoneId': 'jijoca'},
      'totalAmountCents': 1000, 'paymentStatus': 'paid',
      'createdAt': '2026-10-26T12:00:00Z', 'updatedAt': '2026-10-26T12:00:00Z',
    }],
  });
}
