import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/core/config/driver_map_config.dart';

void main() {
  test('mapa inicial aproxima a frota sem exigir Google Maps', () {
    expect(DriverMapConfig.fallbackZoom, greaterThanOrEqualTo(16));
    expect(DriverMapConfig.recenterZoom(12), DriverMapConfig.fallbackZoom);
    expect(DriverMapConfig.recenterZoom(17.5), 17.5);
  });

  test('rota cabe em telas pequenas sem margem lateral excessiva', () {
    for (final width in [320.0, 375, 390, 428, 768]) {
      final margin = DriverMapConfig.routeEdgePadding(width);
      expect(margin, inInclusiveRange(32, 72));
      expect(width - margin * 2, greaterThan(width * .5));
    }
    expect(DriverMapConfig.routeEdgePadding(320), lessThan(60));
    expect(DriverMapConfig.routeEdgePadding(390), lessThan(72));
    expect(DriverMapConfig.routeEdgePadding(768), 72);
  });

  test('valores de janela ou zoom inválidos têm fallback seguro', () {
    expect(DriverMapConfig.routeEdgePadding(double.nan), 48);
    expect(DriverMapConfig.routeEdgePadding(-1), 48);
    expect(DriverMapConfig.recenterZoom(double.nan), 16);
    expect(DriverMapConfig.recenterZoom(double.negativeInfinity), 16);
  });
}
