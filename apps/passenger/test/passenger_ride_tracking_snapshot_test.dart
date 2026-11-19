import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/rides/domain/passenger_ride_tracking_snapshot.dart';

PassengerRideTrackingSnapshot snapshot(String state) {
  return PassengerRideTrackingSnapshot(
    rideId: 'ride-tracking-test',
    state: state,
    category: 'car',
  );
}

void main() {
  test('NO_DRIVER_FOUND continua acompanhando possível estorno', () {
    expect(snapshot('NO_DRIVER_FOUND').isTerminal, isFalse);
    expect(snapshot('REFUND_PENDING').isTerminal, isFalse);
    expect(snapshot('REFUNDED').isTerminal, isTrue);
  });

  test('corrida concluída permanece terminal', () {
    expect(snapshot('COMPLETED').isTerminal, isTrue);
  });
}
