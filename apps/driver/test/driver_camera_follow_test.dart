import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_driver/src/core/config/driver_map_config.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/widgets/driver_live_map.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/widgets/driver_map_panel_extent.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/widgets/driver_camera_padding.dart';

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
  testWidgets('manual pan/pinch holds the camera until all fingers release, then resumes latest GPS after three quiet seconds', (tester) async {
    final sdk = CameraRecorder(), c = DriverMapController(); c.attach(sdk);
    await c.move(const LatLng(-2.82,-40.41));
    c.onCameraMoveStarted(); expect(c.followPaused.value, false, reason: 'SDK animation is not a user gesture');
    c.onMapPointerDown(); c.onMapPointerDown();
    c.resumeNativeFollow(); expect(c.followPaused.value, true, reason: 'automatic stage updates cannot interrupt a held gesture');
    await c.followNavigation(const LatLng(-2.83,-40.42));
    await tester.pump(const Duration(seconds:4)); expect(sdk.commands, hasLength(1));
    c.onMapPointerUp(); await tester.pump(const Duration(seconds:4)); expect(c.followPaused.value, true);
    c.onMapPointerUp(); await tester.pump(const Duration(seconds:2));
    c.updateCamera(const gm.CameraPosition(target:gm.LatLng(-2.9,-40.5), zoom:14, bearing:90));
    await c.followNavigation(const LatLng(-2.84,-40.43));
    await tester.pump(const Duration(milliseconds:2999)); expect(sdk.commands, hasLength(1));
    await tester.pump(const Duration(milliseconds:2)); expect(sdk.commands, hasLength(2)); expect(c.followPaused.value, false);
    final encoded = sdk.commands.last.toString(); expect(encoded, contains('-40.43')); expect(encoded, contains('55'));
    c.dispose();
  });
  testWidgets('idle/offline camera also pauses; wheel restarts delay and disposal cancels callbacks', (tester) async {
    final sdk = CameraRecorder(), c = DriverMapController(); c.attach(sdk);
    await c.move(const LatLng(-2.82,-40.41));
    expect(sdk.commands.single.toString(), contains('55'));
    c.onMapWheel(); await c.move(const LatLng(-2.83,-40.42));
    await tester.pump(const Duration(seconds:2)); c.onMapWheel();
    await tester.pump(const Duration(seconds:2)); expect(sdk.commands, hasLength(1));
    c.dispose(); await tester.pump(const Duration(seconds:5)); expect(sdk.commands, hasLength(1)); expect(tester.takeException(), isNull);
  });
  testWidgets('in-flight SDK animation never queues a stale camera through a gesture', (tester) async {
    final sdk = CameraRecorder()..blocked=Completer<void>(); final c=DriverMapController()..attach(sdk);
    final first=c.move(const LatLng(-2.82,-40.41));
    await c.move(const LatLng(-2.83,-40.42));
    c.onMapPointerDown(); await c.move(const LatLng(-2.84,-40.43));
    sdk.blocked!.complete(); await first; expect(sdk.commands, hasLength(1));
    c.onMapPointerUp(); await tester.pump(const Duration(seconds:3)); expect(sdk.commands, hasLength(2));
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
