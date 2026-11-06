import '../../home/domain/service_type.dart';
import '../../map/domain/ramo_place.dart';
import '../../map/domain/route_info.dart';
import '../domain/pricing_quote.dart';

abstract interface class PricingQuoteService {
  Future<PricingQuote> quote({
    required ServiceType service,
    required RamoPlace origin,
    required RamoPlace destination,
    required String originZoneId,
    required String destinationZoneId,
    required RouteInfo route,
    int passengers = 1,
    DateTime? now,
  });
}

class PricingQuoteException implements Exception {
  const PricingQuoteException(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => message;
}
