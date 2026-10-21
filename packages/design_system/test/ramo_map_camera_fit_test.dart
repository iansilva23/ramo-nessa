import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

// Independent screen projection checks the actual visible rectangle, rather
// than copying expected zoom/center values from the implementation.
Offset screenPoint(RamoMapPoint point, RamoMapCameraFit camera, Size size) {
  double y(double lat) {
    final sinLat = math.sin(lat * math.pi / 180);
    return .5 - math.log((1 + sinLat) / (1 - sinLat)) / (4 * math.pi);
  }
  var dx = (point.longitude - camera.center.longitude) / 360;
  if (dx > .5) dx -= 1;
  if (dx < -.5) dx += 1;
  final scale = 256 * math.pow(2, camera.zoom);
  return Offset(size.width / 2 + dx * scale,
      size.height / 2 + (y(point.latitude) - y(camera.center.latitude)) * scale);
}

void main() {
  const route = [RamoMapPoint(-2.7956, -40.5142), RamoMapPoint(-2.8986, -40.4506)];
  test('route stays above cards in portrait, landscape, tablet and desktop', () {
    for (final size in [const Size(320, 568), const Size(390, 844),
      const Size(844, 390), const Size(860, 1100), const Size(1440, 900)]) {
      final padding = EdgeInsets.fromLTRB(12, size.height * .15, 12, size.height * .37);
      final fit = RamoMapCameraFit.calculate(points: route, viewport: size, padding: padding)!;
      for (final point in route) {
        final screen = screenPoint(point, fit, size);
        expect(screen.dx, inInclusiveRange(padding.left + 24 - .01, size.width - padding.right - 24 + .01));
        expect(screen.dy, inInclusiveRange(padding.top + 24 - .01, size.height - padding.bottom - 24 + .01));
      }
    }
  });
  test('identical, horizontal and vertical routes have finite camera targets', () {
    for (final points in [const [RamoMapPoint(-2.8, -40.5)],
      const [RamoMapPoint(-2.8, -40.5), RamoMapPoint(-2.8, -40.5)],
      const [RamoMapPoint(-2.8, -40.5), RamoMapPoint(-2.8, -40.4)],
      const [RamoMapPoint(-2.8, -40.5), RamoMapPoint(-2.9, -40.5)]]) {
      final fit = RamoMapCameraFit.calculate(points: points, viewport: const Size(390, 760))!;
      expect(fit.zoom, inInclusiveRange(4, 17));
      expect(fit.center.latitude.isFinite && fit.center.longitude.isFinite, isTrue);
    }
  });
  test('crossing antimeridian does not frame the whole world', () {
    final fit = RamoMapCameraFit.calculate(points: const [RamoMapPoint(0, 179.9),
      RamoMapPoint(0, -179.9)], viewport: const Size(390, 760))!;
    expect(fit.center.longitude.abs(), closeTo(180, .001));
    expect(fit.zoom, greaterThan(9));
  });
  test('invalid or not-yet-laid-out map never produces a camera command', () {
    for (final size in [Size.zero, const Size(390, 0), const Size(double.infinity, 760)]) {
      expect(RamoMapCameraFit.calculate(points: route, viewport: size), isNull);
    }
    expect(RamoMapCameraFit.calculate(points: route, viewport: const Size(390, 760), padding: const EdgeInsets.all(500)), isNull);
    expect(RamoMapCameraFit.calculate(points: const [RamoMapPoint(91, 0)], viewport: const Size(390, 760)), isNull);
    expect(RamoMapCameraFit.calculate(points: const [RamoMapPoint(double.nan, 0)], viewport: const Size(390, 760)), isNull);
  });
}
