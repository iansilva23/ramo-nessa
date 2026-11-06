import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/pricing_location_resolver.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/domain/pricing_quote.dart';

void main() {
  test('cotação exata do Core formata BRL', () {
    final quote = PricingQuote.fromJson(const {
      'kind': 'exact',
      'ruleId': 'jeri-prea-comfort',
      'totalAmountCents': 15000,
      'platformCommissionCents': 1500,
      'driverNetCents': 13500,
    });

    expect(quote.isExact, isTrue);
    expect(quote.formatted, 'R\$ 150,00');
    expect(quote.platformCommissionCents, 1500);
    expect(quote.driverNetCents, 13500);
  });

  test('faixa de preço não finge valor exato', () {
    final quote = PricingQuote.fromJson(const {
      'kind': 'range',
      'ruleId': 'prea-formosa-moto',
      'minTotalAmountCents': 800,
      'maxTotalAmountCents': 1000,
    });

    expect(quote.isExact, isFalse);
    expect(quote.formatted, 'R\$ 8,00–R\$ 10,00');
  });

  test('resolver reconhece Aeroporto JJD e localidades explícitas', () {
    const airport = RamoPlace(
      name: 'Aeroporto de Jericoacoara',
      address: 'Cruz, Ceará',
      position: LatLng(-2.906425, -40.357338),
    );
    const mangueSeco = RamoPlace(
      name: 'Mangue Seco',
      address: 'Jijoca de Jericoacoara, Ceará',
      position: LatLng(-2.8, -40.5),
    );

    final airportRef = PricingLocationResolver.resolve(
      place: airport,
      serviceZoneId: 'airport-jjd',
    );
    final mangueRef = PricingLocationResolver.resolve(
      place: mangueSeco,
      serviceZoneId: 'jijoca',
    );

    expect(airportRef.zoneId, 'external');
    expect(airportRef.localityId, 'airport-jjd');
    expect(mangueRef.localityId, 'mangue-seco');
  });

  test('resolver envia destino longo aprovado como localidade externa', () {
    const sobral = RamoPlace(
      name: 'Sobral',
      address: 'Sobral, Ceará, Brasil',
      position: LatLng(-3.68, -40.35),
    );

    final ref = PricingLocationResolver.resolve(
      place: sobral,
      serviceZoneId: 'external',
    );

    expect(ref.zoneId, 'external');
    expect(ref.localityId, 'sobral');
  });
}
