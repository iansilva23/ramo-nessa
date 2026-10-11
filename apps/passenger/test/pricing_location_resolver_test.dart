import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/pricing_location_resolver.dart';

void main() {
  test('localidade aprovada pelo Core tem prioridade sobre aliases locais', () {
    const place = RamoPlace(
      name: 'Nome livre que não contém o alias',
      address: 'Endereço retornado pelo Google',
      position: LatLng(-2.95, -40.20),
      approvedPricingZoneId: 'prea',
      approvedPricingLocalityId: 'aranau',
      placeProof: 'signed-local-place-proof-abcdefghijklmnopqrstuvwxyz',
    );

    final resolved = PricingLocationResolver.resolve(
      place: place,
      serviceZoneId: 'external',
    );

    expect(resolved.zoneId, 'prea');
    expect(resolved.localityId, 'aranau');
  });

  test('fallback por alias continua disponível sem prova do Core', () {
    const place = RamoPlace(
      name: 'Formosa',
      address: 'Formosa, Cruz - CE',
      position: LatLng(-2.82, -40.41),
    );

    final resolved = PricingLocationResolver.resolve(
      place: place,
      serviceZoneId: 'prea',
    );

    expect(resolved.zoneId, 'prea');
    expect(resolved.localityId, 'formosa');
  });
}
