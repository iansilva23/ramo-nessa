import 'dart:ui' as ui;

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('cada categoria usa um marcador 3D visual empacotado', () async {
    final assets = <String>{
      RamoMapMarkerAssets.passenger,
      RamoMapMarkerAssets.destination,
      RamoMapMarkerAssets.vehicle('car'),
      RamoMapMarkerAssets.vehicle('comfort_black'),
      RamoMapMarkerAssets.vehicle('moto'),
      RamoMapMarkerAssets.vehicle('delivery'),
      RamoMapMarkerAssets.vehicle('buggy'),
    };

    expect(RamoMapMarkerAssets.vehicle('comfort_black'),
        isNot(RamoMapMarkerAssets.vehicle('car')));
    expect(assets.length, 7);
    for (final asset in assets) {
      final data = await rootBundle.load(asset);
      expect(data.lengthInBytes, greaterThan(1000), reason: asset);
      final codec = await ui.instantiateImageCodec(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
      );
      final frame = await codec.getNextFrame();
      final image = frame.image;
      expect(image.width, 96, reason: asset);
      expect(image.height, 96, reason: asset);
      final rgba = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
      expect(rgba, isNotNull, reason: asset);
      expect(rgba!.getUint8(3), 0, reason: 'fundo transparente: $asset');
      image.dispose();
      codec.dispose();
    }
  });
}
