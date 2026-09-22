import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import '../../home/domain/service_type.dart';
import '../../map/domain/ramo_place.dart';
import '../../map/domain/route_info.dart';
import '../domain/pricing_quote.dart';
import 'pricing_location_resolver.dart';
import 'pricing_quote_service.dart';

class HttpPricingQuoteService implements PricingQuoteService {
  HttpPricingQuoteService({
    required Uri baseUrl,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final http.Client _client;

  @override
  Future<PricingQuote> quote({
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
          _baseUrl.resolve('/v1/pricing/quote'),
          headers: const {'content-type': 'application/json'},
          body: jsonEncode({
            'origin': originRef.toJson(),
            'destination': destinationRef.toJson(),
            'category': service.backendKey,
            'period': isNight ? 'after_22' : 'day',
            'tripDistanceKm': route.distanceMeters / 1000,
            'passengers': passengers,
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = jsonDecode(response.body);

    if (response.statusCode == 200 && decoded is Map<String, dynamic>) {
      return PricingQuote.fromJson(decoded);
    }

    if (decoded is Map<String, dynamic>) {
      throw PricingQuoteException(
        decoded['message'] as String? ??
            'Essa categoria ainda não está disponível para a rota.',
      );
    }

    throw const PricingQuoteException(
      'Não conseguimos obter o preço dessa rota agora.',
    );
  }
}
