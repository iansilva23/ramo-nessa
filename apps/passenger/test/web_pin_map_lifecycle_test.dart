import 'dart:async';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show PlatformViewCreatedCallback;
import 'package:flutter_test/flutter_test.dart';
// Locked transitive interface is used only to replace the SDK in this test.
// ignore: depend_on_referenced_packages
import 'package:google_maps_flutter_platform_interface/google_maps_flutter_platform_interface.dart' as gi;
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/place_search_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/profile/presentation/saved_place_pin_screen.dart';

class DelayedReverse extends NoSearch implements CoordinateAddressResolver {
  final response = Completer<RamoPlace?>();
  @override
  Future<RamoPlace?> reverseCoordinate(LatLng coordinate) => response.future;
}

class NoSearch implements PlaceSearchService {
  @override
  Future<List<RamoPlace>> search(String query) async => [];
}

// Real GoogleMap/GoogleMapController lifecycle, no provider/DOM/tiles.
class LifecycleMapPlatform extends gi.GoogleMapsFlutterPlatform {
  final configurations = <gi.MapConfiguration>[];
  @override
  Future<void> updateMapConfiguration(gi.MapConfiguration update, {required int mapId}) async { configurations.add(update); }
  final created = <int>{};
  final disposals = <int, int>{};
  @override
  Future<void> init(int mapId) async {}
  @override
  Future<void> updateMarkers(gi.MarkerUpdates updates, {required int mapId}) async {}
  @override
  Future<void> updateClusterManagers(gi.ClusterManagerUpdates updates, {required int mapId}) async {}
  @override
  Future<void> updatePolygons(gi.PolygonUpdates updates, {required int mapId}) async {}
  @override
  Future<void> updatePolylines(gi.PolylineUpdates updates, {required int mapId}) async {}
  @override
  Future<void> updateCircles(gi.CircleUpdates updates, {required int mapId}) async {}
  @override
  Future<void> updateHeatmaps(gi.HeatmapUpdates updates, {required int mapId}) async {}
  @override
  Future<void> updateGroundOverlays(gi.GroundOverlayUpdates updates, {required int mapId}) async {}
  @override
  Future<void> updateTileOverlays({required Set<gi.TileOverlay> newTileOverlays, required int mapId}) async {}
  @override
  void dispose({required int mapId}) {
    disposals.update(mapId, (count) => count + 1, ifAbsent: () => 1);
  }
  @override
  Widget buildViewWithConfiguration(int creationId, PlatformViewCreatedCallback onPlatformViewCreated, {
    required gi.MapWidgetConfiguration widgetConfiguration,
    gi.MapConfiguration mapConfiguration = const gi.MapConfiguration(),
    gi.MapObjects mapObjects = const gi.MapObjects(),
  }) {
    if (created.add(creationId)) {
      WidgetsBinding.instance.addPostFrameCallback((_) => onPlatformViewCreated(creationId));
    }
    return const ColoredBox(color: Colors.blueGrey);
  }
  @override
  Stream<gi.CameraMoveStartedEvent> onCameraMoveStarted({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.CameraMoveEvent> onCameraMove({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.CameraIdleEvent> onCameraIdle({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.MarkerTapEvent> onMarkerTap({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.InfoWindowTapEvent> onInfoWindowTap({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.MarkerDragStartEvent> onMarkerDragStart({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.MarkerDragEvent> onMarkerDrag({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.MarkerDragEndEvent> onMarkerDragEnd({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.PolylineTapEvent> onPolylineTap({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.PolygonTapEvent> onPolygonTap({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.CircleTapEvent> onCircleTap({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.PointOfInterestTapEvent> onPointOfInterestTap({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.MapTapEvent> onTap({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.MapLongPressEvent> onLongPress({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.ClusterTapEvent> onClusterTap({required int mapId}) => const Stream.empty();
  @override
  Stream<gi.GroundOverlayTapEvent> onGroundOverlayTap({required int mapId}) => const Stream.empty();
}

void main() {
  testWidgets('Web pin allows one-finger drag and locks gestures while saving', (tester) async {
    if (!kIsWeb) return;
    final previousErrorHandler = FlutterError.onError;
    FlutterError.onError = (details) {
      debugPrint('PIN_GESTURE_FRAMEWORK_ERROR: ${details.exceptionAsString()}\n${details.stack}');
      previousErrorHandler?.call(details);
    };
    addTearDown(() => FlutterError.onError = previousErrorHandler);
    final original = gi.GoogleMapsFlutterPlatform.instance;
    final sdk = LifecycleMapPlatform();
    gi.GoogleMapsFlutterPlatform.instance = sdk;
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      gi.GoogleMapsFlutterPlatform.instance = original;
    });
    final resolver = DelayedReverse();
    await tester.pumpWidget(MaterialApp(home: SavedPlacePinScreen(
      searchService: resolver, initialPosition: const LatLng(-2.82017, -40.41467))));
    await tester.pumpAndSettle();
    expect(tester.widget<gm.GoogleMap>(find.byType(gm.GoogleMap)).webGestureHandling, gm.WebGestureHandling.greedy);
    await tester.tap(find.text('Confirmar este ponto'));
    await tester.pump();
    expect(tester.widget<gm.GoogleMap>(find.byType(gm.GoogleMap)).webGestureHandling, gm.WebGestureHandling.none);
    expect(sdk.configurations.last.webGestureHandling, gi.WebGestureHandling.none);
    await tester.pumpWidget(const SizedBox.shrink());
    resolver.response.complete(null);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
  testWidgets('returning from Web pin screen disposes each SDK map exactly once', (tester) async {
    if (!kIsWeb) return;
    final originalErrorHandler = FlutterError.onError;
    FlutterError.onError = (details) {
      // Provider-free diagnostic: expose framework errors hidden by Chrome's
      // test console while preserving the test binding's failure handler.
      debugPrint('PIN_FRAMEWORK_ERROR: ${details.exceptionAsString()}');
      originalErrorHandler?.call(details);
    };
    addTearDown(() => FlutterError.onError = originalErrorHandler);
    final original = gi.GoogleMapsFlutterPlatform.instance;
    final sdk = LifecycleMapPlatform();
    gi.GoogleMapsFlutterPlatform.instance = sdk;
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      gi.GoogleMapsFlutterPlatform.instance = original;
    });
    for (var i = 0; i < 2; i++) {
      await tester.pumpWidget(MaterialApp(home: SavedPlacePinScreen(
        searchService: NoSearch(), initialPosition: const LatLng(-2.82017, -40.41467),
      )));
      await tester.pumpAndSettle();
      debugPrint('PIN_MOUNT: cycle=$i created=${sdk.created} disposals=${sdk.disposals}');
      expect(sdk.created.length, i + 1);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      debugPrint('PIN_DISPOSE: cycle=$i created=${sdk.created} disposals=${sdk.disposals}');
      expect(sdk.disposals.length, i + 1);
      expect(sdk.disposals.values, everyElement(1));
      expect(tester.takeException(), isNull);
    }
  });
}

