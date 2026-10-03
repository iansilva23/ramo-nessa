import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import '../../../core/network/json_response.dart';
import '../../home/domain/service_type.dart';
import '../../map/domain/ramo_place.dart';
import '../../map/domain/route_info.dart';
import '../../pricing/data/pricing_location_resolver.dart';
import '../domain/prepared_ride.dart';
import 'ride_preparation_service.dart';
import 'expandable_ride_preparation_service.dart';

class HttpRidePreparationService implements RidePreparationService, ExpandableRidePreparationService {
  HttpRidePreparationService({
    required Uri baseUrl,
    String? accessToken,
    String? passengerId,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _accessToken = accessToken ?? '',
        _passengerId = passengerId ?? RamoCoreConfig.devPassengerId,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _accessToken;
  final String _passengerId;
  final http.Client _client;

  Map<String, String> get _identityHeaders => {
        'content-type': 'application/json',
        if (_accessToken.trim().isNotEmpty)
          'authorization': 'Bearer ${_accessToken.trim()}'
        else if (_passengerId.trim().isNotEmpty)
          'x-dev-passenger-id': _passengerId.trim(),
      };

  @override
  Future<DriverSearchOptions> searchOptions(ServiceType service) async {
    final response = await _client.get(_baseUrl.resolve('/v1/driver-search/policy'),
      headers: _identityHeaders).timeout(RamoCoreConfig.requestTimeout);
    final json = decodeJsonObject(response.body);
    final categories = json?['categories'];
    if (response.statusCode != 200 || categories is! Map<String, dynamic> ||
        categories[service.backendKey] is! Map<String, dynamic>) {
      throw const RidePreparationException('Não conseguimos consultar a ampliação de busca.');
    }
    return DriverSearchOptions.fromJson(categories[service.backendKey] as Map<String, dynamic>);
  }

  @override
  Future<PreparedRide> prepareWithRadius(RideSearchRequest request, double radiusKm) => _prepare(
    service: request.service, origin: request.origin, destination: request.destination,
    originZoneId: request.originZoneId, destinationZoneId: request.destinationZoneId,
    route: request.route, passengers: request.passengers, searchRadiusKm: radiusKm);

  @override
  Future<PreparedRide> prepare({
    required ServiceType service, required RamoPlace origin, required RamoPlace destination,
    required String originZoneId, required String destinationZoneId, required RouteInfo route,
    int passengers = 1, DateTime? now,
  }) => _prepare(service: service, origin: origin, destination: destination,
    originZoneId: originZoneId, destinationZoneId: destinationZoneId, route: route,
    passengers: passengers, now: now);

  Future<PreparedRide> _prepare({
    required ServiceType service,
    required RamoPlace origin,
    required RamoPlace destination,
    required String originZoneId,
    required String destinationZoneId,
    required RouteInfo route,
    int passengers = 1,
    DateTime? now,
    double? searchRadiusKm,
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
          headers: _identityHeaders,
          body: jsonEncode({
            if (searchRadiusKm != null) 'searchRadiusKm': searchRadiusKm,
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
            if (origin.placeProof?.trim().isNotEmpty == true)
              'pickupPlaceProof': origin.placeProof!.trim(),
            if (destination.placeProof?.trim().isNotEmpty == true)
              'dropoffPlaceProof': destination.placeProof!.trim(),
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);

    if (response.statusCode == 201 && decoded != null) {
      try {
        return PreparedRide.fromJson(decoded);
      } catch (_) {
        throw const RidePreparationException(
          'O servidor retornou uma corrida preparada inválida.',
        );
      }
    }

    throw RidePreparationException(
      apiErrorMessage(
        decoded,
        'Não conseguimos preparar essa corrida agora.',
      ),
      code: decoded?['error'] as String?,
    );
  }
}
