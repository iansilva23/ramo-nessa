import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/service_area/domain/service_area_policy.dart';

void main() {
  test('Jeri, Jijoca, Preá e Aeroporto JJD ficam na área operacional', () {
    expect(
      RamoServiceArea.zoneFor(const LatLng(-2.80023, -40.51638))?.id,
      'jericoacoara',
    );
    expect(
      RamoServiceArea.zoneFor(const LatLng(-2.89860, -40.45060))?.id,
      'jijoca',
    );
    expect(
      RamoServiceArea.zoneFor(const LatLng(-2.82017, -40.41467))?.id,
      'prea',
    );
    expect(
      RamoServiceArea.zoneFor(const LatLng(-2.906425, -40.357338))?.id,
      'airport-jjd',
    );
  });

  test('destino externo aprovado entra na área comercial sem abrir qualquer ponto', () {
    const prea = RamoPlace(
      name: 'Preá',
      address: 'Preá, Cruz, Ceará',
      position: LatLng(-2.82017, -40.41467),
    );
    const sobral = RamoPlace(
      name: 'Sobral',
      address: 'Sobral, Ceará, Brasil',
      position: LatLng(-3.68, -40.35),
    );

    final check = RamoServiceArea.checkPlaceTrip(
      origin: prea,
      destination: sobral,
    );

    expect(check.isSupported, isTrue);
    expect(check.destinationZone?.id, 'external');
    expect(check.destinationZone?.label, 'Sobral');
  });

  test('ponto distante fica fora da área operacional', () {
    expect(
      RamoServiceArea.contains(const LatLng(-3.7319, -38.5267)),
      isFalse,
    );
  });

  test('viagem só é suportada com origem e destino na área', () {
    final supported = RamoServiceArea.checkTrip(
      origin: const LatLng(-2.80023, -40.51638),
      destination: const LatLng(-2.82017, -40.41467),
    );
    final unsupported = RamoServiceArea.checkTrip(
      origin: const LatLng(-2.80023, -40.51638),
      destination: const LatLng(-3.7319, -38.5267),
    );

    expect(supported.isSupported, isTrue);
    expect(supported.message, isNull);
    expect(unsupported.isSupported, isFalse);
    expect(unsupported.message, contains('destino'));
  });
}
