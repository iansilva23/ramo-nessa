import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/rides/domain/prepared_ride.dart';

Map<String, dynamic> payload({bool consent = false}) => {
  'holdExpiresAt': '2026-10-23T00:01:00Z',
  'paymentExpiresAt': '2026-10-23T00:10:00Z',
  'ride': {
    'id': 'checkout-window', 'state': 'AWAITING_PAYMENT',
    'driverConsentRequired': consent,
    'driverHoldExpiresAt': '2026-10-23T00:01:00Z',
    'paymentExpiresAt': '2026-10-23T00:10:00Z',
    'quote': {'baseAmountCents': 1000, 'pickupCompensationCents': 0, 'totalAmountCents': 1000},
  },
};

void main() {
  test('checkout uses payment deadline after the exclusive driver hold ends', () {
    final ride = PreparedRide.fromJson(payload());
    expect(ride.holdExpiresAt, DateTime.parse('2026-10-23T00:10:00Z'));
  });
  test('legacy accepted driver keeps the original short reservation deadline', () {
    final ride = PreparedRide.fromJson(payload(consent: true));
    expect(ride.holdExpiresAt, DateTime.parse('2026-10-23T00:01:00Z'));
  });
  test('old API responses remain readable', () {
    final data = payload()..remove('paymentExpiresAt');
    (data['ride'] as Map<String, dynamic>).remove('paymentExpiresAt');
    expect(PreparedRide.fromJson(data).holdExpiresAt, DateTime.parse('2026-10-23T00:01:00Z'));
  });
}
