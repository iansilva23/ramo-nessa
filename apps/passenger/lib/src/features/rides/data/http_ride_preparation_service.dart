import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import '../../home/domain/service_type.dart';
import '../../map/domain/ramo_place.dart';
import '../../map/domain/route_info.dart';
import '../../pricing/data/pricing_location_resolver.dart';
import '../domain/prepared_ride.dart';
import 'ride_preparation_service.dart';

class HttpRidePreparationService implements RidePreparationService {
  HttpRidePreparationService({
    required Uri baseUrl,
    required String passengerId,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _passengerId = passengerId,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _passengerId;
  final http.Client _client;

  @override
  Future<PreparedRide> prepare({
    required ServiceType service,
    required RamoPlace origin,
    required RamoPlace destination,
    required String originZoneId,
    required String destinationZoneId,
    required RouteInfo route,
    int passengers = 1,
    DateTime? now,
  }) async {
    final originRef = PricingLocationResolver.resolve(
      place: origin,
      serviceZoneId: originZoneId,
    );
    final destinationRef = PricingLocationResolver.resolve(
      place: destination,
      serviceZoneId: destinationZoneId,
    );

    final instant = (now ?? DateTime.now()).toLocal();
    final isNight = instant.hour >= 22 || instant.hour < 6;

    final response = await _client
        .post(
          _baseUrl.resolve('/v1/rides/prepare'),
          headers: {
            'content-type': 'application/json',
            'x-dev-passenger-id': _passengerId,
          },
          body: jsonEncode({
            'quoteRequest': {
              'origin': originRef.toJson(),
              'destination': destinationRef.toJson(),
              'category': service.backendKey,
              'period': isNight ? 'after_22' : 'day',
              'tripDistanceKm': route.distanceMeters / 1000,
              'passengers': passengers,
            },
            'pickup': {
              'latitude': origin.position.latitude,
              'longitude': origin.position.longitude,
            },
            'dropoff': {
              'latitude': destination.position.latitude,
              'longitude': destination.position.longitude,
            },
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = jsonDecode(response.body);

    if (response.statusCode == 201 && decoded is Map<String, dynamic>) {
      return PreparedRide.fromJson(decoded);
    }

    if (decoded is Map<String, dynamic>) {
      throw RidePreparationException(
        decoded['message'] as String? ??
            'Não conseguimos preparar essa corrida agora.',
      );
    }

    throw const RidePreparationException(
      'Não conseguimos preparar essa corrida agora.',
    );
  }
}
