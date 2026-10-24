import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/route_info.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/http_pricing_quote_service.dart';

void main() {
  const origin = RamoPlace(
    name: 'Preá', address: 'Cruz, CE',
    position: LatLng(-2.82017, -40.41467),
    approvedPricingZoneId: 'prea', approvedPricingLocalityId: 'prea',
  );
  const destination = RamoPlace(
    name: 'Jijoca', address: 'Jijoca de Jericoacoara, CE',
    position: LatLng(-2.89860, -40.45060),
    approvedPricingZoneId: 'jijoca', approvedPricingLocalityId: 'jijoca',
  );
  const route = RouteInfo(
    points: [LatLng(-2.82017, -40.41467), LatLng(-2.89860, -40.45060)],
    distanceMeters: 14500, duration: Duration(minutes: 25),
  );

  test('contrato Core → Passageiro exibe preço exato por categoria', () async {
    for (final serviceType in ServiceType.values) {
      late Map<String, dynamic> submitted;
      final client = MockClient((request) async {
        expect(request.url.path, '/v1/pricing/quote');
        submitted = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(jsonEncode({
          'kind': 'exact', 'ruleId': 'fixture-${serviceType.backendKey}',
          'baseAmountCents': 12345, 'pickupCompensationCents': 0,
          'totalAmountCents': 12345,
          'pricingCatalog': {'catalogVersion': 'test'},
        }), 200, headers: {'content-type':'application/json'});
      });
      final clientService = HttpPricingQuoteService(
        baseUrl: Uri.parse('https://core.ramonessa.test'), client: client,
      );
      final quote = await clientService.quote(
        service: serviceType, origin: origin, destination: destination,
        originZoneId: 'prea', destinationZoneId: 'jijoca', route: route,
      );
      expect(submitted['category'], serviceType.backendKey);
      expect(submitted['origin'], {'zoneId': 'prea', 'localityId': 'prea'});
      expect(submitted['destination'], {'zoneId': 'jijoca', 'localityId': 'jijoca'});
      expect(submitted['tripDistanceKm'], 14.5);
      expect(quote.isExact, isTrue);
      expect(quote.formatted, r'R$ 123,45');
    }
  });

  test('contrato Core → Passageiro apresenta faixa de preço sem inventar valor exato', () async {
    final service = HttpPricingQuoteService(
      baseUrl: Uri.parse('https://core.ramonessa.test'),
      client: MockClient((_) async => http.Response(jsonEncode({
        'kind':'range', 'ruleId':'range-test',
        'minTotalAmountCents':1000, 'maxTotalAmountCents':2000,
        'requiresExactResolution':true,
      }), 200)),
    );
    final quote = await service.quote(
      service: ServiceType.car, origin: origin, destination: destination,
      originZoneId: 'prea', destinationZoneId: 'jijoca', route: route,
    );
    expect(quote.isExact, isFalse);
    expect(quote.formatted, r'R$ 10,00–R$ 20,00');
  });
}
