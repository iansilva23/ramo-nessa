import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

void main() {
  test('segue a curva da rota e muda a orientação do veículo', () {
    final path = RamoRouteMotionPath.between(
      from: const RamoMapPoint(0, 0),
      to: const RamoMapPoint(.001, .001),
      route: const [
        RamoMapPoint(0, 0),
        RamoMapPoint(0, .001),
        RamoMapPoint(.001, .001),
      ],
    );

    final beforeCurve = path.sample(.25);
    final afterCurve = path.sample(.75);
    expect(beforeCurve.point.latitude, closeTo(0, .00005));
    expect(afterCurve.point.longitude, closeTo(.001, .00005));
    expect(beforeCurve.bearing, closeTo(90, 8));
    expect(afterCurve.bearing, closeTo(0, 8));
  });

  test('usa movimento direto quando a geometria está distante', () {
    final path = RamoRouteMotionPath.between(
      from: const RamoMapPoint(0, 0),
      to: const RamoMapPoint(.001, .001),
      route: const [
        RamoMapPoint(1, 1),
        RamoMapPoint(1, 1.1),
      ],
    );
    expect(path.points, hasLength(2));
  });
}
