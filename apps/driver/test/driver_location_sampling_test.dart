import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:ramo_nessa_driver/src/core/location/device_driver_location_service.dart';
import 'package:ramo_nessa_driver/src/core/location/driver_location_service.dart';

Position sample({bool measured = true}) => Position(latitude: -2.82, longitude: -40.41,
  timestamp: DateTime.now(), accuracy: 3, altitude: 0, altitudeAccuracy: 0,
  heading: measured ? 90 : 0, headingAccuracy: measured ? 5 : 0,
  speed: measured ? 4 : 0, speedAccuracy: measured ? .4 : 0,
  hasAccuracy: true, hasSpeed: measured, hasHeading: measured,
  hasSpeedAccuracy: measured, hasHeadingAccuracy: measured);
class LocationPlatform extends GeolocatorPlatform {
  final backgroundSettings = <LocationSettings>[];
  final cameraSettings = <LocationSettings>[];
  late StreamController<Position> positions;
  int active = 0;
  Completer<Position>? waiting;
  @override Future<bool> isLocationServiceEnabled() async => true;
  @override Future<LocationPermission> checkPermission() async => LocationPermission.always;
  @override Future<Position> getCurrentPosition({LocationSettings? locationSettings}) async {
    cameraSettings.add(locationSettings!); return waiting == null ? sample() : waiting!.future;
  }
  @override Stream<Position> getPositionStream({LocationSettings? locationSettings}) {
    backgroundSettings.add(locationSettings!);
    positions = StreamController<Position>(onListen: () { active++; }, onCancel: () { active--; });
    return positions.stream;
  }
}
void main() {
  testWidgets('fast foreground samples preserve the continuous background GPS and ignore late reads after hiding', (tester) async {
    if (kIsWeb) return;
    final original = GeolocatorPlatform.instance, platform = LocationPlatform();
    GeolocatorPlatform.instance = platform; debugDefaultTargetPlatformOverride = TargetPlatform.android;
    addTearDown(() { GeolocatorPlatform.instance = original; debugDefaultTargetPlatformOverride = null; });
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    final service = DeviceDriverLocationService(), values = <DriverPosition>[];
    final subscription = service.positionStream().listen(values.add);
    await tester.pump(const Duration(milliseconds: 10));
    final background = platform.backgroundSettings.single as AndroidSettings;
    expect(background.intervalDuration, const Duration(seconds: 10)); expect(background.distanceFilter, 20);
    expect(background.foregroundNotificationConfig!.enableWakeLock, true);
    final foreground = platform.cameraSettings.single as AndroidSettings;
    expect(foreground.intervalDuration, const Duration(seconds: 1)); expect(foreground.distanceFilter, 3);
    expect(foreground.timeLimit, const Duration(seconds: 2));
    expect(values.last.courseDegrees, 90); expect(values.last.speedMetersPerSecond, 4);
    platform.positions.add(sample(measured: false)); await tester.pump();
    expect(values.last.speedMetersPerSecond, isNull); expect(values.last.courseDegrees, isNull);
    // An in-flight foreground fix is not allowed to repaint after the app hides.
    platform.waiting = Completer<Position>();
    await tester.pump(const Duration(seconds: 1));
    final calls = platform.cameraSettings.length, count = values.length;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    platform.waiting!.complete(sample()); await tester.pump();
    await tester.pump(const Duration(seconds: 3));
    expect(platform.cameraSettings, hasLength(calls)); expect(values, hasLength(count));
    expect(platform.active, 1); expect(platform.backgroundSettings, hasLength(1));
    platform.positions.add(sample()); await tester.pump();
    expect(values, hasLength(count + 1), reason: 'background GPS must continue through the original subscription');
    platform.waiting = null;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed); await tester.pump();
    expect(platform.cameraSettings, hasLength(calls + 1)); expect(platform.active, 1);
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    final apple = service.streamSettings(foreground: false) as AppleSettings;
    expect(apple.allowBackgroundLocationUpdates, true); expect(apple.pauseLocationUpdatesAutomatically, false);
    expect(apple.showBackgroundLocationIndicator, true); expect(apple.distanceFilter, 20);
    await subscription.cancel(); expect(platform.active, 0);
    final finalCalls = platform.cameraSettings.length;
    await tester.pump(const Duration(seconds: 3)); expect(platform.cameraSettings, hasLength(finalCalls));
    await platform.positions.close();
  });
}
