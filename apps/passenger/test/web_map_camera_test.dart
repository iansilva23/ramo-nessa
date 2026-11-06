import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/widgets/ramo_live_map.dart';

// Deliberately returns the OLD zoom, as the Web plugin can do immediately
// after fitBounds. A successful Web fit must never read or correct that zoom.
class RecordingMap extends Fake implements gm.GoogleMapController {
  final moves = <Object>[];
  final animations = <Object>[];
  var zoomReads = 0;
  @override
  Future<void> moveCamera(gm.CameraUpdate update) async { moves.add(update.toJson()); }
  @override
  Future<void> animateCamera(gm.CameraUpdate update, {Duration? duration}) async { animations.add(update.toJson()); }
  @override
  Future<double> getZoomLevel() async { zoomReads++; return 19; }
}

void main() {
  test('route selection sends a complete Web camera without a gesture or stale zoom', () async {
    final sdk = RecordingMap();
    final controller = RamoMapController();
    controller.attach(sdk);
    controller.updateViewport(const Size(390, 760), const EdgeInsets.fromLTRB(12, 90, 12, 290));
    await controller.fitCoordinates(coordinates: const [LatLng(-2.7956, -40.5142), LatLng(-2.8986, -40.4506)]);
    if (kIsWeb) {
      expect(sdk.animations, isEmpty);
      expect(sdk.zoomReads, 0);
      expect(sdk.moves, hasLength(1));
      final camera = sdk.moves.single as List;
      expect(camera.first, 'newLatLngZoom');
      expect(camera[2] as double, lessThanOrEqualTo(17));
      expect((camera[1] as List).every((n) => (n as num).isFinite), isTrue);
    } else {
      expect(sdk.moves, isEmpty);
      expect((sdk.animations.first as List).first, 'newLatLngBounds');
      expect(sdk.zoomReads, 1);
    }
    controller.dispose();
    await controller.fitCoordinates(coordinates: const [LatLng(-2.7956, -40.5142), LatLng(-2.8986, -40.4506)]);
    expect(sdk.moves.length + sdk.animations.length, kIsWeb ? 1 : 2);
  });
  test('Web camera waits for a usable viewport', () async {
    if (!kIsWeb) return;
    final sdk = RecordingMap();
    final controller = RamoMapController()..attach(sdk);
    await controller.fitCoordinates(coordinates: const [LatLng(-2.7956, -40.5142), LatLng(-2.8986, -40.4506)]);
    expect(sdk.moves, isEmpty);
    controller.updateViewport(const Size(390, 760), const EdgeInsets.fromLTRB(12, 90, 12, 290));
    await controller.fitCoordinates(coordinates: const [LatLng(-2.7956, -40.5142), LatLng(-2.8986, -40.4506)]);
    expect(sdk.moves, hasLength(1));
    controller.dispose();
  });
}
