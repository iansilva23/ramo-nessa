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
    }
  });
}
