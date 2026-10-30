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
import 'preparation_operation_journal.dart';

class HttpRidePreparationService implements RidePreparationService, ExpandableRidePreparationService {
  HttpRidePreparationService({
    required Uri baseUrl,
    String? accessToken,
    String? passengerId,
    String? clientInstanceId,
    http.Client? client,
    this.operationJournal,
  })  : _baseUrl = baseUrl,
        _accessToken = accessToken ?? '',
        _clientInstanceId = clientInstanceId ?? '',
        _passengerId = passengerId ?? RamoCoreConfig.devPassengerId,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _accessToken;
  final String _clientInstanceId;
  final String _passengerId;
  final http.Client _client;
  // Opt-in injection only. Existing callers retain their current behavior.
  final PreparationOperationJournal? operationJournal;
  PreparationSearchIntent? _intent;
  final Map<String, PreparationOperation> _preparedOperations = {};
  final Map<String, PreparationOperation> _issuedOperations = {};
  bool _abandoned = false;

  Future<void> abandonIntent() async {
    _abandoned = true;
    final journal = operationJournal;
    if (journal == null) return;
    for (final operation in _issuedOperations.values.toList()) {
      await journal.abandon(operation);
    }
  }

  Future<void> acknowledgePrepared(String rideId) async {
    final operation = _preparedOperations[rideId];
    if (operation == null) return;
    await operationJournal!.acknowledge(operation);
    _preparedOperations.remove(rideId);
    _issuedOperations.remove(operation.key);
  }

  /// A new selection screen is a new user intent, including identical routes.
  HttpRidePreparationService forNewIntent() => HttpRidePreparationService(
    baseUrl: _baseUrl, accessToken: _accessToken, passengerId: _passengerId,
    clientInstanceId: _clientInstanceId, client: _client,
    operationJournal: operationJournal,
  );

  /// Exact-byte retries after process restart. Never generates a new key.
  Future<PreparedRide> replayOperation(PreparationOperation operation) async {
    if (operationJournal == null) throw StateError('Replay is not configured.');
    if (operation.abandoned) {
      throw const RidePreparationException('A busca foi interrompida.');
    }
    return _sendPreparation(operation.bodyJson, operation: operation);
  }


  Map<String, String> get _identityHeaders => {
        'content-type': 'application/json',
        if (_clientInstanceId.trim().isNotEmpty) 'x-client-instance-id': _clientInstanceId.trim(),
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

    final body = <String, dynamic>{
            if (searchRadiusKm != null) 'searchRadiusKm': searchRadiusKm,
            'quoteRequest': {
              'origin': originRef.toJson(),
              'destination': destinationRef.toJson(),
              'category': service.backendKey,
              'period': isNight ? 'after_22' : 'day',
              'tripDistanceKm': route.distanceMeters / 1000,
              'passengers': passengers,
            },
            if (origin.address.trim().isNotEmpty && origin.address != 'Coordenada aprovada pelo catálogo vigente')
              'pickupInstructions': origin.address,
            if (destination.address.trim().isNotEmpty && destination.address != 'Coordenada aprovada pelo catálogo vigente')
              'dropoffInstructions': destination.address,
            'pickupLabel': origin.displayName.trim(),
            'dropoffLabel': destination.displayName.trim(),
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
          };
    final intent = _intent ??= operationJournal?.newIntent();
    if (intent == null) return _sendPreparation(jsonEncode(body));
    // The screen captures the chosen pickup/destination. Period is calculated
    // from the clock and must not split a retry that crosses 22:00.
    final quote = Map<String, dynamic>.from(body['quoteRequest'] as Map)
      ..remove('period');
    final selection = jsonEncode({...body, 'quoteRequest': quote});
    final operation = await intent.operation(selection: selection, body: body);
    _issuedOperations[operation.key] = operation;
    if (_abandoned) {
      await operationJournal!.abandon(operation);
      throw const RidePreparationException('A busca foi interrompida.');
    }
    return _sendPreparation(operation.bodyJson, operation: operation);
  }

  Future<PreparedRide> _sendPreparation(String bodyJson, {
    PreparationOperation? operation,
  }) async {
    if (operation != null && operationJournal?.owns(operation) != true) {
      throw StateError('Operation belongs to a different passenger or Core.');
    }
    final response = await _client.post(
      _baseUrl.resolve('/v1/rides/prepare'),
      headers: {
        ..._identityHeaders,
        if (operation != null) 'idempotency-key': operation.key,
      },
      body: bodyJson,
    ).timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);

    if (response.statusCode == 201 && decoded != null) {
      try {
        final prepared = PreparedRide.fromJson(decoded);
        if (operation != null) _preparedOperations[prepared.id] = operation;
        return prepared;
      } catch (_) {
        throw const RidePreparationException(
          'O servidor retornou uma corrida preparada inválida.',
        );
      }
    }

    final code = decoded?['error'] as String?;
    if (operation != null && code == 'NO_ELIGIBLE_DRIVER') {
      await operationJournal!.acknowledge(operation);
      _issuedOperations.remove(operation.key);
      _intent = null;
    }
    if (const {'PREPARATION_EXPIRED', 'PREPARATION_ALREADY_ADVANCED'}.contains(code)) {
      // The next explicit button press is a new search. Keep the old journal
      // entry until authenticated recovery has checked its current state.
      _intent = null;
    }
    throw PreparationReplayException(
      apiErrorMessage(
        decoded,
        'Não conseguimos preparar essa corrida agora.',
      ),
      code: code,
      rideId: decoded?['rideId'] as String?,
    );
  }
}


class PreparationReplayException extends RidePreparationException {
  const PreparationReplayException(super.message, {super.code, this.rideId});
  final String? rideId;
}
