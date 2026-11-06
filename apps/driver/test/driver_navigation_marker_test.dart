import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/core/map/driver_navigation_marker.dart';

void main() {
  test('arrow follows accepted and restored rides through pickup and trip', () {
    for (final state in ['AWAITING_PAYMENT', 'DRIVER_ASSIGNED',
      'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS']) {
      expect(usesDriverNavigationArrow(state), isTrue, reason: state);
    }
  });
  test('no navigation arrow for offers, terminal or unknown states', () {
    for (final state in [null, 'SEARCHING', 'OFFERED', 'COMPLETED',
      'CANCELLED', 'INTERRUPTED', 'UNKNOWN']) {
      expect(usesDriverNavigationArrow(state), isFalse, reason: '$state');
    }
  });
}
