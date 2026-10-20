import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/http_pricing_quote_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/route_info.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/pricing_location_resolver.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/pricing_policy_service.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/domain/managed_pricing_catalog.dart';
import 'package:ramo_nessa_passenger/src/features/service_area/domain/service_area_policy.dart';

void main() {
  test('Web quote sends session selector and coordinates; native transport stays unchanged', () async {
    const token = 'ramo_web_passenger_v1_11111111111111111111111111111111';
    final service = HttpPricingQuoteService(
      baseUrl: Uri.parse('https://example.invalid'),
      accessToken: token,
      client: MockClient((request) async {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        if (kIsWeb) {
          expect(request.headers['authorization'], 'Bearer $token');
          expect(body['pickup'], {'latitude': -2.82, 'longitude': -40.41});
          expect(body['dropoff'], {'latitude': -2.83, 'longitude': -40.42});
        } else {
          expect(request.headers.containsKey('authorization'), isFalse);
          expect(body.containsKey('pickup'), isFalse);
        }
        return http.Response(jsonEncode({'kind': 'exact', 'ruleId': 'synthetic', 'totalAmountCents': 2700}), 200);
      }),
    );
    final quote = await service.quote(
      service: ServiceType.car,
      origin: const RamoPlace(name: 'Preá', address: '', position: LatLng(-2.82, -40.41)),
      destination: const RamoPlace(name: 'Preá', address: '', position: LatLng(-2.83, -40.42)),
      originZoneId: 'prea', destinationZoneId: 'prea',
      route: const RouteInfo(points: [], distanceMeters: 5000, duration: Duration(minutes: 10)),
    );
    expect(quote.totalAmountCents, 2700);
  });

  tearDown(() => ManagedPricingCatalog.update(enabled: false, zones: null, categories: null));
  test('managed coverage and presentation apply only to Web', () {
    PassengerPricingPolicy.fromJson({
      'managementMode': 'managed',
      'enabledCategories': ['moto'],
      'enabledZones': ['prea', 'external'],
      'buggy': {'minPassengers': 1, 'maxPassengers': 4},
      'localityGeofences': [
        {'zoneId': 'prea', 'localityId': 'prea', 'centerLatitude': -2.82, 'centerLongitude': -40.41, 'radiusKm': 3},
        {'zoneId': 'external', 'localityId': 'small', 'centerLatitude': -2.819, 'centerLongitude': -40.41, 'radiusKm': 0.5},
      ],
      'regions': [
        {'id': 'prea', 'name': 'Preá'},
        {'id': 'small', 'name': 'Synthetic region'},
      ],
      'categories': [
        {'id': 'moto', 'name': 'Synthetic motorcycle', 'description': 'Configured in admin', 'icon': 'car'},
      ],
    });
    expect(ManagedPricingCatalog.enabled, kIsWeb);
    if (!kIsWeb) {
      expect(ServiceType.moto.label, 'Mototáxi');
      return;
    }
    const point = LatLng(-2.82, -40.41);
    expect(ManagedPricingCatalog.zoneFor(point)?.localityId, 'small');
    expect(RamoServiceArea.zoneFor(point)?.localityId, 'small');
    const place = RamoPlace(name: 'Old name', address: '', position: point,
      approvedPricingZoneId: 'prea', approvedPricingLocalityId: 'prea');
    final ref = PricingLocationResolver.resolve(place: place, serviceZoneId: 'prea');
    expect(ref.zoneId, 'external');
    expect(ref.localityId, 'small');
    expect(RamoServiceArea.endpointForPlace(place)?.label, 'Synthetic region');
    expect(ServiceType.moto.label, 'Synthetic motorcycle');
    expect(ServiceType.moto.description, 'Configured in admin');
    expect(ServiceType.moto.icon, Icons.directions_car_filled_rounded);
    expect(ManagedPricingCatalog.zoneFor(const LatLng(0, 0)), isNull);
    expect(RamoServiceArea.endpointForPlace(const RamoPlace(name: 'Aeroporto JJD',address:'',position:LatLng(0,0))), isNull);
  });
}
