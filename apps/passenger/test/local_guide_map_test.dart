import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/passenger_home_screen.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/vehicle_selection_screen.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/passenger_payment_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/ride_preparation_service.dart';

import 'web_map_selection_race_test.dart'
    show
        NoRelease,
        NoAgency,
        NoSearch,
        DelayedLocation,
        RecordingRoutes,
        ControlledPolicy,
        pickup;
import 'managed_route_availability_test.dart' show RecordingQuotes;

class NoAutomaticRide extends Fake implements RidePreparationService {
  int calls = 0;
  @override
  dynamic noSuchMethod(Invocation invocation) {
    calls++;
    throw StateError('No automatic ride allowed');
  }
}

class NoAutomaticPayment extends Fake implements PassengerPaymentService {
  int calls = 0;
  @override
  dynamic noSuchMethod(Invocation invocation) {
    calls++;
    throw StateError('No automatic payment allowed');
  }
}

void main() {
  testWidgets(
    'Guide destination fills existing map, routes and quotes without requesting a driver or charging',
    (tester) async {
      final location = DelayedLocation(),
          routes = RecordingRoutes(),
          quotes = RecordingQuotes(),
          ride = NoAutomaticRide(),
          payment = NoAutomaticPayment(),
          target = ValueNotifier<RamoPlace?>(null);
      await tester.pumpWidget(
        MaterialApp(
          home: PassengerHomeScreen(
            guideDestination: target,
            releasePolicyService: NoRelease(),
            agencyPromotionService: NoAgency(),
            locationService: location,
            routeService: routes,
            placeSearchService: NoSearch(),
            pricingPolicyService: ControlledPolicy(),
            pricingQuoteService: quotes,
            ridePreparationService: ride,
            paymentService: payment,
            networkTilesEnabled: false,
          ),
        ),
      );
      location.response.complete(pickup.position);
      await tester.pumpAndSettle();
      target.value = const RamoPlace(
        name: 'Restaurante do Guia',
        address: 'Destino cadastrado',
        position: LatLng(-2.817, -40.410),
        placeProof: 'synthetic-proof',
      );
      await tester.pumpAndSettle();
      expect(routes.destinations, contains(const LatLng(-2.817, -40.410)));
      expect(find.byType(VehicleSelectionScreen), findsOneWidget);
      expect(quotes.categories, isNotEmpty);
      expect(find.text('Restaurante do Guia'), findsWidgets);
      expect(ride.calls, 0);
      expect(payment.calls, 0);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      target.dispose();
    },
  );
}
