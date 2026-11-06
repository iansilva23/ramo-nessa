import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/driver_web_availability_policy.dart';

void main() {
  test('web switches to safety mode only on real background transitions', () {
    expect(DriverWebAvailabilityPolicy.isBackgroundTransition(AppLifecycleState.hidden), true);
    expect(DriverWebAvailabilityPolicy.isBackgroundTransition(AppLifecycleState.paused), true);
    expect(DriverWebAvailabilityPolicy.isBackgroundTransition(AppLifecycleState.detached), true);
    expect(DriverWebAvailabilityPolicy.isBackgroundTransition(AppLifecycleState.inactive), false);
    expect(DriverWebAvailabilityPolicy.isBackgroundTransition(AppLifecycleState.resumed), false);
  });

  test('only web drivers online without ongoing ride should be set offline', () {
    expect(DriverWebAvailabilityPolicy.shouldSetOffline(
      isWeb: true, online: true, busy: false, hasActiveRide: false,
    ), true);
    expect(DriverWebAvailabilityPolicy.shouldSetOffline(
      isWeb: false, online: true, busy: false, hasActiveRide: false,
    ), false);
    expect(DriverWebAvailabilityPolicy.shouldSetOffline(
      isWeb: true, online: true, busy: true, hasActiveRide: false,
    ), false);
    expect(DriverWebAvailabilityPolicy.shouldSetOffline(
      isWeb: true, online: true, busy: false, hasActiveRide: true,
    ), false);
    expect(DriverWebAvailabilityPolicy.shouldSetOffline(
      isWeb: true, online: false, busy: false, hasActiveRide: false,
    ), false);
  });
}
