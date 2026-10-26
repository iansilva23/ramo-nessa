import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_models.dart';

void main() {
  final json = <String, dynamic>{
    'id': 'ride-label', 'state': 'COMPLETED', 'category': 'car',
    'origin': {'zoneId': 'prea'}, 'destination': {'zoneId': 'jijoca'},
    'driverEarningsCents': 9000, 'totalAmountCents': 10000,
    'platformFeeCents': 1000, 'updatedAt': '2026-10-26T12:00:00Z',
  };
  test('activity keeps selected places and falls back for older rides', () {
    final named = DriverActivityRide.fromJson({...json,
      'pickupLabel': 'Pousada do Preá', 'dropoffLabel': 'Café Jijoca'});
    expect(named.originDisplayName, 'Pousada do Preá');
    expect(named.destinationDisplayName, 'Café Jijoca');
    final legacy = DriverActivityRide.fromJson(json);
    expect(legacy.originDisplayName, 'Preá');
    expect(legacy.destinationDisplayName, 'Jijoca');
  });
}
