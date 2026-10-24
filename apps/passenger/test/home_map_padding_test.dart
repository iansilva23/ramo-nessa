import 'package:flutter/widgets.dart';
import 'package:latlong2/latlong.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/core/config/ramo_map_config.dart';

void main() {
  test('GPS recente mantém foco da rota selecionada', () {
    expect(
      RamoMapConfig.shouldCenterOnGpsUpdate(hasDestination: false),
      isTrue,
    );
    expect(
      RamoMapConfig.shouldCenterOnGpsUpdate(hasDestination: true),
      isFalse,
    );
    expect(RamoMapConfig.locationZoom, greaterThan(16));
  });

  test('rota com origem e destino idênticos não cria bounds degenerados', () {
    const origin = LatLng(-2.82017, -40.41467);
    const destination = LatLng(-2.89860, -40.45060);
    expect(RamoMapConfig.hasRouteBounds(const []), isFalse);
    expect(RamoMapConfig.hasRouteBounds(const [origin]), isFalse);
    expect(RamoMapConfig.hasRouteBounds(const [origin, origin]), isFalse);
    expect(
      RamoMapConfig.hasRouteBounds(const [origin, origin, destination]),
      isTrue,
    );
    expect(
      RamoMapConfig.hasRouteBounds(const [origin, destination]),
      isTrue,
    );
  });

  test('painel inferior não vira margem lateral na rota', () {
    final padding = ramoHomeMapPadding(
      viewport: const Size(390, 844),
      safeTop: 47,
      sheetExtent: .48,
    );
    expect(padding.left + padding.right, lessThan(30));
    expect(390 - padding.horizontal, greaterThan(350));
    expect(padding.bottom, greaterThan(390));
    expect(844 - padding.vertical, greaterThan(250));
  });

  test('enquadramento acompanha o painel e preserva área em telas pequenas', () {
    for (final viewport in [const Size(320, 568), const Size(844, 390)]) {
      final collapsed = ramoHomeMapPadding(
        viewport: viewport,
        safeTop: 47,
        sheetExtent: .42,
      );
      final expanded = ramoHomeMapPadding(
        viewport: viewport,
        safeTop: 47,
        sheetExtent: .76,
        hasAgencyBanner: true,
      );
      expect(expanded.bottom, greaterThanOrEqualTo(collapsed.bottom));
      expect(viewport.height - expanded.vertical, greaterThanOrEqualTo(119.9));
      expect(expanded.left, collapsed.left);
      expect(expanded.right, collapsed.right);
    }
  });
}
