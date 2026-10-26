import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_push/ramo_push.dart';

void main() {
  setUp(clearNotificationIntents);
  tearDown(clearNotificationIntents);
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
