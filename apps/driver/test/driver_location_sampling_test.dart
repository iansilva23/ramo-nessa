import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:ramo_nessa_driver/src/core/location/device_driver_location_service.dart';
import 'package:ramo_nessa_driver/src/core/location/driver_location_service.dart';

class LocationPlatform extends GeolocatorPlatform {
  final settings = <LocationSettings>[];
  final streams = <StreamController<Position>>[];
  int active = 0;
  @override Future<bool> isLocationServiceEnabled() async => true;
  @override Future<LocationPermission> checkPermission() async => LocationPermission.always;
  @override Stream<Position> getPositionStream({LocationSettings? locationSettings}) {
    settings.add(locationSettings!);
    final controller = StreamController<Position>(onListen: () { active++; }, onCancel: () { active--; });
    streams.add(controller); return controller.stream;
  }
}
void main() {
  testWidgets('foreground fixes are quick, background service stays enabled and uploads retain telemetry', (tester) async {
    if (kIsWeb) return;
    final original = GeolocatorPlatform.instance, platform = LocationPlatform();
    GeolocatorPlatform.instance = platform;
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    addTearDown(() { GeolocatorPlatform.instance = original; debugDefaultTargetPlatformOverride = null; });
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    final service = DeviceDriverLocationService(), values = <DriverPosition>[];
    final subscription = service.positionStream().listen(values.add);
    await tester.pump(); await tester.pump();
    final foreground = platform.settings.last as AndroidSettings;
    expect(foreground.intervalDuration, const Duration(seconds: 1)); expect(foreground.distanceFilter, 3);
    expect(foreground.foregroundNotificationConfig!.enableWakeLock, true);
    final position = Position(latitude: -2.82, longitude: -40.41, timestamp: DateTime.now(), accuracy: 3,
      altitude: 0, altitudeAccuracy: 0, heading: 90, headingAccuracy: 5, speed: 4, speedAccuracy: .4,
      hasAccuracy: true, hasSpeed: true, hasHeading: true, hasSpeedAccuracy: true, hasHeadingAccuracy: true);
    platform.streams.last.add(position); await tester.pump();
    expect(values.single.courseDegrees, 90); expect(values.single.speedMetersPerSecond, 4);
    expect(values.single.accuracyMeters, 3); expect(values.single.observedAt, position.timestamp);
    platform.streams.last.add(Position(latitude: -2.82, longitude: -40.41, timestamp: DateTime.now(), accuracy: 3,
      altitude: 0, altitudeAccuracy: 0, heading: 0, headingAccuracy: 0, speed: 0, speedAccuracy: 0));
    await tester.pump();
    expect(values.last.speedMetersPerSecond, isNull); expect(values.last.courseDegrees, isNull);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(); await tester.pump();
    expect(platform.settings.length, 2, reason: 'the platform subscription must be replaced on background transition');
    final background = platform.settings.last as AndroidSettings;
    expect(background.intervalDuration, const Duration(seconds: 10)); expect(background.distanceFilter, 20);
    expect(background.foregroundNotificationConfig!.enableWakeLock, true); expect(platform.active, 1);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump(); await tester.pump(); expect((platform.settings.last as AndroidSettings).distanceFilter, 3);
    expect(platform.active, 1);
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    final apple = service.streamSettings(foreground: false) as AppleSettings;
    expect(apple.allowBackgroundLocationUpdates, true); expect(apple.pauseLocationUpdatesAutomatically, false);
    expect(apple.showBackgroundLocationIndicator, true); expect(apple.distanceFilter, 20);
    await subscription.cancel(); expect(platform.active, 0);
    final count = platform.settings.length;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused); await tester.pump();
    expect(platform.settings, hasLength(count));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    for (final stream in platform.streams) { await stream.close(); }
  });
}
