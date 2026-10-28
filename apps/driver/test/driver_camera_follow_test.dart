import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_driver/src/core/config/driver_map_config.dart';
import 'package:ramo_nessa_driver/src/core/location/driver_location_service.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/widgets/driver_live_map.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/widgets/driver_map_panel_extent.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/widgets/driver_camera_padding.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/widgets/driver_follow_frame.dart';

class CameraRecorder extends Fake implements gm.GoogleMapController {
  final commands = <dynamic>[];
  Completer<void>? blocked;
  @override
  Future<void> animateCamera(gm.CameraUpdate update, {Duration? duration}) async {
    commands.add(update.toJson()); await blocked?.future;
  }
}
void main() {
  test('card padding preserves a viewport and follows east/west camera headings', () {
    final padding = driverCameraPadding(const Size(320, 400), const EdgeInsets.fromLTRB(14, 224, 14, 330));
    expect(400 - padding.vertical, greaterThanOrEqualTo(95.99));
    const target = gm.LatLng(-2.82, -40.41);
    gm.CameraPosition camera(double bearing) => gm.CameraPosition(target: target, zoom: 17.6, tilt: 55, bearing: bearing);
    final north = driverWebPaddedCamera(camera(0), padding);
    final east = driverWebPaddedCamera(camera(90), padding);
    final west = driverWebPaddedCamera(camera(270), padding);
    expect(north.target.latitude, lessThan(target.latitude));
    expect(east.target.longitude, lessThan(target.longitude));
    expect(west.target.longitude, greaterThan(target.longitude));
    expect(east.target.latitude, closeTo(target.latitude, .000001));
    expect(east.zoom, 17.6); expect(east.tilt, 55); expect(east.bearing, 90);
    expect(driverWebPaddedCamera(camera(0), EdgeInsets.zero), camera(0));
  });
  test('route distance changes only a bounded zoom, never the reference tilt', () {
    final close = DriverMapConfig.navigationZoomFor(100), far = DriverMapConfig.navigationZoomFor(50000);
    expect(close, greaterThan(far)); expect(far, greaterThanOrEqualTo(17.3)); expect(close, lessThanOrEqualTo(18.35));
    expect(DriverMapConfig.navigationTilt, DriverMapConfig.homeTilt);
    expect(DriverMapConfig.navigationZoomFor(double.nan), DriverMapConfig.navigationZoom);
    const points = [LatLng(-2.82,-40.41), LatLng(-2.83,-40.41), LatLng(-2.84,-40.41)];
    expect(DriverMapConfig.remainingRouteMeters(points[1], points), closeTo(DriverMapConfig.distanceMeters(points[1],points[2]), 1));
  });
  testWidgets('manual view follows the next fix without restoring zoom, tilt or offset after three seconds', (tester) async {
    final sdk = CameraRecorder(), c = DriverMapController();
    c.updateViewport(const Size(390, 760), const EdgeInsets.fromLTRB(14, 80, 14, 210)); c.attach(sdk);
    const point = LatLng(-2.82, -40.41);
    await c.move(point);
    c.onMapPointerDown(); c.onMapPointerDown();
    const chosen = gm.CameraPosition(target: gm.LatLng(-2.8198, -40.4097), zoom: 15.25, tilt: 38, bearing: 45);
    c.updateCamera(chosen); c.resumeNativeFollow();
    await c.followNavigation(point);
    await tester.pump(const Duration(seconds: 4)); expect(sdk.commands, hasLength(1));
    c.onMapPointerUp(); await tester.pump(const Duration(seconds: 1)); expect(c.followPaused.value, true);
    c.onMapPointerUp(); c.onCameraIdle();
    expect(c.followPaused.value, false); expect(c.hasChosenFrame, true);
    const next = LatLng(-2.8201, -40.41);
    await c.followNavigation(next);
    final moved = recordedCamera(sdk);
    expect(moved.zoom, 15.25); expect(moved.tilt, 38); expect(moved.bearing, 45);
    expect(moved.target.latitude, isNot(chosen.target.latitude));
    final before = DriverFollowFrame.capture(camera: chosen, vehicle: point, course: 0,
      viewport: const Size(390, 760), padding: const EdgeInsets.fromLTRB(14, 80, 14, 210), web: kIsWeb)!;
    final after = DriverFollowFrame.capture(camera: moved, vehicle: next, course: 0,
      viewport: const Size(390, 760), padding: const EdgeInsets.fromLTRB(14, 80, 14, 210), web: kIsWeb)!;
    expect(after.anchor.dx, closeTo(before.anchor.dx, .000001));
    expect(after.anchor.dy, closeTo(before.anchor.dy, .000001));
    final count = sdk.commands.length;
    await tester.pump(const Duration(seconds: 5)); expect(sdk.commands, hasLength(count));
    await c.fitCoordinates(const [point, next]); expect(sdk.commands, hasLength(count));
    c.dispose();
  });
  testWidgets('zoom buttons retain the selected zoom and a detached/background map cannot reset it', (tester) async {
    final sdk = CameraRecorder(), c = DriverMapController();
    c.updateViewport(const Size(390, 760)); c.attach(sdk);
    await c.move(const LatLng(-2.82, -40.41));
    await c.zoomBy(-1); c.onCameraIdle();
    final zoom = c.currentZoom;
    await c.followNavigation(const LatLng(-2.8201, -40.41));
    expect(recordedCamera(sdk).zoom, zoom);
    c.setVisible(false); final count = sdk.commands.length;
    await c.followNavigation(const LatLng(-2.8202, -40.41)); expect(sdk.commands, hasLength(count));
    c.detach(); c.attach(sdk); c.resetNavigationForNewMap(); c.setVisible(true);
    await c.stopNativeNavigation(const LatLng(-2.8203, -40.41));
    expect(recordedCamera(sdk).zoom, zoom); expect(c.hasChosenFrame, true);
    c.onMapWheel(); c.dispose(); await tester.pump(const Duration(seconds: 5)); expect(tester.takeException(), isNull);
  });
  testWidgets('in-flight SDK writes never overwrite a held manual view', (tester) async {
    final sdk = CameraRecorder()..blocked = Completer<void>(); final c = DriverMapController()..attach(sdk);
    c.updateViewport(const Size(390, 760));
    final first = c.move(const LatLng(-2.82, -40.41));
    await c.move(const LatLng(-2.8201, -40.41));
    c.onMapPointerDown();
    c.updateCamera(const gm.CameraPosition(target: gm.LatLng(-2.82, -40.409), zoom: 14, tilt: 42, bearing: 80));
    await c.followNavigation(const LatLng(-2.8202, -40.41));
    sdk.blocked!.complete(); await first; expect(sdk.commands, hasLength(1));
    c.onMapPointerUp(); c.onCameraIdle();
    await c.followNavigation(const LatLng(-2.8203, -40.41));
    expect(recordedCamera(sdk).zoom, 14); expect(recordedCamera(sdk).tilt, 42); expect(recordedCamera(sdk).bearing, 80);
    c.dispose();
  });
  test('frame preserves anchor through turns, fractional zoom and the date line', () {
    const viewport = Size(430, 850), padding = EdgeInsets.fromLTRB(14, 150, 14, 210);
    for (final web in [true, false]) {
      const vehicle = LatLng(-2.82, 179.9998);
      const camera = gm.CameraPosition(target: gm.LatLng(-2.8199, -179.9998), zoom: 16.4, tilt: 45, bearing: 30);
      final frame = DriverFollowFrame.capture(camera: camera, vehicle: vehicle, course: 0,
        viewport: viewport, padding: padding, web: web)!;
      for (final course in [0.0, 90.0, 180.0, 270.0, 359.0]) {
        const next = LatLng(-2.8201, -179.9995);
        final moved = frame.cameraFor(vehicle: next, course: course, viewport: viewport, padding: padding, web: web);
        final recovered = DriverFollowFrame.capture(camera: moved, vehicle: next, course: course,
          viewport: viewport, padding: padding, web: web)!;
        expect(recovered.anchor.dx, closeTo(frame.anchor.dx, .000001));
        expect(recovered.anchor.dy, closeTo(frame.anchor.dy, .000001));
        expect(moved.zoom, 16.4); expect(moved.tilt, 45);
      }
    }
  });
  test('an older GPS result cannot move the camera backwards after a fresh fix', () async {
    final now = DateTime.utc(2026, 10, 27, 12);
    final sdk = CameraRecorder(), c = DriverMapController(now: () => now);
    c.updateViewport(const Size(390, 760)); c.attach(sdk);
    expect(c.observePosition(DriverPosition(latitude: -2.82, longitude: -40.41, observedAt: now)), true);
    expect(c.observePosition(DriverPosition(latitude: -2.83, longitude: -40.42,
      observedAt: now.subtract(const Duration(seconds: 1)))), false);
    await c.followNavigation(const LatLng(-2.83, -40.42));
    final camera = recordedCamera(sdk);
    expect(camera.target.latitude, closeTo(-2.82, .000001));
    expect(camera.target.longitude, closeTo(-40.41, .000001));
    c.dispose();
  });
  testWidgets('measured card height follows text/layout changes and minimization', (tester) async {
    final heights=<double>[];
    Widget screen(double h)=>MaterialApp(home:Align(alignment:Alignment.bottomCenter,child:DriverMapPanelExtent(onHeight:heights.add,child:SizedBox(width:320,height:h))));
    await tester.pumpWidget(screen(240)); await tester.pump(); expect(heights.last,240);
    await tester.pumpWidget(screen(72)); await tester.pump(); expect(heights.last,72);
    await tester.pumpWidget(const SizedBox()); expect(tester.takeException(),isNull);
  });
}

gm.CameraPosition recordedCamera(CameraRecorder recorder) {
  final data = (recorder.commands.last as List)[1] as Map;
  final target = data['target'] as List;
  return gm.CameraPosition(target: gm.LatLng((target[0] as num).toDouble(), (target[1] as num).toDouble()),
    zoom: (data['zoom'] as num).toDouble(), tilt: (data['tilt'] as num).toDouble(), bearing: (data['bearing'] as num).toDouble());
}
