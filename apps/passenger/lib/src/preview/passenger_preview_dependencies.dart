import 'package:latlong2/latlong.dart';

import '../core/location/location_service.dart';
import '../features/home/domain/service_type.dart';
import '../features/map/domain/ramo_place.dart';
import '../features/map/domain/route_info.dart';
import '../features/payments/data/passenger_payment_service.dart';
import '../features/payments/domain/card_ride_payment_result.dart';
import '../features/payments/domain/cash_ride_authorization_result.dart';
import '../features/payments/domain/passenger_payment_policy.dart';
import '../features/payments/domain/pix_ride_payment_result.dart';
import '../features/payments/domain/wallet_ride_payment_result.dart';
import '../features/pricing/data/pricing_quote_service.dart';
import '../features/pricing/domain/pricing_quote.dart';
import '../features/rides/data/passenger_ride_tracking_service.dart';
import '../features/rides/data/ride_preparation_service.dart';
import '../features/rides/domain/passenger_ride_tracking_snapshot.dart';
import '../features/rides/domain/prepared_ride.dart';

/// Dependências locais usadas somente em builds RAMO_PREVIEW_MODE=true.
///
/// Nenhuma delas é usada no build normal. O objetivo é permitir que o dono do
/// produto navegue pela UX no aparelho antes de o Core público estar hospedado.
final class PassengerPreviewDependencies {
  PassengerPreviewDependencies();

  final LocationService location = const _PreviewLocationService();
  final PricingQuoteService pricing = const _PreviewPricingService();
  final RidePreparationService ridePreparation =
      const _PreviewRidePreparationService();
  final PassengerPaymentService payments = _PreviewPaymentService();
  final PassengerRideTrackingService tracking =
      _PreviewRideTrackingService();
}

final class _PreviewLocationService implements LocationService {
  const _PreviewLocationService();

  @override
  Future<LatLng> getCurrentLocation() async =>
      const LatLng(-2.7956, -40.5142);
}

final class _PreviewPricingService implements PricingQuoteService {
  const _PreviewPricingService();

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
    final cents = switch (service) {
      ServiceType.moto => 2600,
      ServiceType.delivery => 3200,
      ServiceType.car => 4200,
      ServiceType.buggy => 4500 + ((passengers - 1) * 400),
      ServiceType.comfortBlack => 6200,
    };

    return PricingQuote.fromJson({
      'kind': 'exact',
      'ruleId': 'preview-${service.backendKey}',
      'totalAmountCents': cents,
      'platformCommissionCents': cents ~/ 10,
      'driverNetCents': cents - (cents ~/ 10),
    });
  }
}

final class _PreviewRidePreparationService
    implements RidePreparationService {
  const _PreviewRidePreparationService();

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
    final base = switch (service) {
      ServiceType.moto => 2600,
      ServiceType.delivery => 3200,
      ServiceType.car => 4200,
      ServiceType.buggy => 4500 + ((passengers - 1) * 400),
      ServiceType.comfortBlack => 6200,
    };

    return PreparedRide(
      id: 'preview-ride-${DateTime.now().millisecondsSinceEpoch}',
      state: 'AWAITING_PAYMENT',
      baseAmountCents: base,
      pickupCompensationCents: 0,
      totalAmountCents: base,
      holdExpiresAt: DateTime.now().add(const Duration(minutes: 5)),
    );
  }
}

final class _PreviewPaymentService implements PassengerPaymentService {
  int _walletCents = 12500;

  @override
  Future<PassengerPaymentPolicy> paymentPolicy() async =>
      const PassengerPaymentPolicy(
        cashEnabled: false,
        allowedMethods: {'pix', 'card', 'wallet'},
        paymentRequiredBeforeDispatch: true,
        passengerWalletEnabled: true,
      );

  @override
  Future<int> walletBalanceCents() async => _walletCents;

  @override
  Future<PixRidePaymentResult> createPixRidePayment({
    required String rideId,
    required String idempotencyKey,
    required String payerEmail,
  }) async {
    return PixRidePaymentResult(
      internalPaymentId: 'preview-pix-payment',
      internalPaymentStatus: 'pending',
      orderId: 'preview-pix-order',
      gatewayPaymentId: 'preview-gateway-pix',
      status: 'created',
      statusDetail: 'waiting_payment',
      ticketUrl: 'https://example.invalid/preview-pix',
      qrCode:
          '00020126580014BR.GOV.BCB.PIX0136preview-ramo-nessa-$rideId'
          '520400005303986540545.005802BR5922RAMO NESSA PREVIEW6009SAO PAULO'
          '62070503***6304ABCD',
      qrCodeBase64: '',
    );
  }

  @override
  Future<CardRidePaymentResult> createCardRidePayment({
    required String rideId,
    required String idempotencyKey,
    required String payerEmail,
    required String cardToken,
    required String paymentMethodId,
    required String paymentMethodType,
    int installments = 1,
  }) async {
    return const CardRidePaymentResult(
      internalPaymentId: 'preview-card-payment',
      internalPaymentStatus: 'paid',
      orderId: 'preview-card-order',
      gatewayPaymentId: 'preview-gateway-card',
      status: 'processed',
      statusDetail: 'accredited',
      paymentConfirmed: true,
      rideState: 'SEARCHING_DRIVER',
    );
  }

  @override
  Future<CashRideAuthorizationResult> authorizeCashRide({
    required String rideId,
    required String idempotencyKey,
  }) async {
    return const CashRideAuthorizationResult(
      rideState: 'AWAITING_PAYMENT',
      amountCents: 0,
      duplicateAuthorization: false,
      authorized: false,
    );
  }

  @override
  Future<WalletRidePaymentResult> payRideWithWallet({
    required String rideId,
    required String idempotencyKey,
  }) async {
    const fare = 4500;
    _walletCents = (_walletCents - fare).clamp(0, 1 << 31).toInt();
    return WalletRidePaymentResult(
      rideState: 'SEARCHING_DRIVER',
      walletBalanceCents: _walletCents,
      duplicatePayment: false,
      paymentConfirmed: true,
      dispatchStatus: 'SEARCHING_DRIVER',
    );
  }
}

final class _PreviewRideTrackingService
    implements PassengerRideTrackingService {
  int _checks = 0;

  @override
  Future<PassengerRideTrackingSnapshot> tracking(String rideId) async {
    _checks += 1;
    final state = _checks < 3 ? 'SEARCHING_DRIVER' : 'DRIVER_ASSIGNED';

    return PassengerRideTrackingSnapshot(
      rideId: rideId,
      state: state,
      category: 'buggy',
      pickupLatitude: -2.7956,
      pickupLongitude: -40.5142,
      dropoffLatitude: -2.8118,
      dropoffLongitude: -40.5795,
      driverLocation: state == 'DRIVER_ASSIGNED'
          ? PassengerDriverLocation(
              latitude: -2.7982,
              longitude: -40.5180,
              updatedAt: DateTime.now(),
              stale: false,
            )
          : null,
    );
  }
}
