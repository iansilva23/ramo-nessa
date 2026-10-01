import 'package:latlong2/latlong.dart';

import '../core/location/location_service.dart';
import '../features/home/domain/service_type.dart';
import '../features/map/data/place_autocomplete_service.dart';
import '../features/map/data/place_search_service.dart';
import '../features/map/data/route_service.dart';
import '../features/map/domain/ramo_place.dart';
import '../features/map/domain/route_info.dart';
import '../features/payments/data/passenger_payment_service.dart';
import '../features/payments/domain/card_ride_payment_result.dart';
import '../features/payments/domain/cash_ride_authorization_result.dart';
import '../features/payments/domain/passenger_payment_policy.dart';
import '../features/payments/domain/passenger_promotion.dart';
import '../features/payments/domain/pix_ride_payment_result.dart';
import '../features/payments/domain/wallet_ride_payment_result.dart';
import '../features/payments/domain/wallet_topup_result.dart';
import '../features/profile/data/passenger_support_service.dart';
import '../features/rides/data/passenger_activity_service.dart';
import '../features/rides/data/passenger_ride_tracking_service.dart';
import '../features/rides/data/ride_preparation_service.dart';
import '../features/rides/domain/passenger_activity.dart';
import '../features/rides/domain/passenger_ride_tracking_snapshot.dart';
import '../features/rides/domain/prepared_ride.dart';

/// Dependências locais usadas somente em builds RAMO_PREVIEW_MODE=true.
///
/// Nenhuma delas é usada no build normal. O objetivo é permitir que o dono do
/// produto navegue pela UX no aparelho antes de o Core público estar hospedado.
final class PassengerPreviewDependencies {
  PassengerPreviewDependencies();

  final LocationService location = const _PreviewLocationService();
  final RouteService route = const _PreviewRouteService();
  final PlaceSearchService places = const _PreviewPlaceSearchService();
  final RidePreparationService ridePreparation =
      const _PreviewRidePreparationService();
  final PassengerPaymentService payments = _PreviewPaymentService();
  final PassengerRideTrackingService tracking =
      _PreviewRideTrackingService();
  final PassengerActivityService activity =
      const _PreviewPassengerActivityService();
  final PassengerSupportService support = _PreviewPassengerSupportService();
}

final class _PreviewPassengerSupportService
    implements PassengerSupportService {
  final List<PassengerSupportTicket> _tickets = [];

  @override
  Future<PassengerSupportTicket> createTicket({
    required String category,
    required String subject,
    required String message,
  }) async {
    final now = DateTime.now();
    final ticket = PassengerSupportTicket(
      id: 'preview-support-${now.microsecondsSinceEpoch}',
      category: category,
      subject: subject,
      message: message,
      status: 'open',
      createdAt: now,
    );
    _tickets.insert(0, ticket);
    return ticket;
  }

  @override
  Future<List<PassengerSupportTicket>> listTickets() async =>
      List.unmodifiable(_tickets);
}

final class _PreviewLocationService implements LocationService {
  const _PreviewLocationService();

  @override
  Future<LatLng> getCurrentLocation() async =>
      const LatLng(-2.7956, -40.5142);
}

final class _PreviewRouteService implements RouteService {
  const _PreviewRouteService();

  @override
  Future<RouteInfo> route({
    required LatLng origin,
    required LatLng destination,
  }) async {
    final distanceMeters =
        const Distance().as(LengthUnit.Meter, origin, destination);
    final seconds = (distanceMeters / 8.33).round().clamp(60, 7200);
    final deltaLatitude = destination.latitude - origin.latitude;
    final deltaLongitude = destination.longitude - origin.longitude;

    return RouteInfo(
      points: [
        origin,
        LatLng(
          origin.latitude + deltaLatitude * .32 - deltaLongitude * .08,
          origin.longitude + deltaLongitude * .32 + deltaLatitude * .08,
        ),
        LatLng(
          origin.latitude + deltaLatitude * .68 + deltaLongitude * .06,
          origin.longitude + deltaLongitude * .68 - deltaLatitude * .06,
        ),
        destination,
      ],
      distanceMeters: distanceMeters,
      duration: Duration(seconds: seconds),
    );
  }
}

final class _PreviewPlaceSearchService
    implements PlaceSearchService, PlaceAutocompleteService {
  const _PreviewPlaceSearchService();

  static const _places = <RamoPlace>[
    RamoPlace(
      name: 'Jericoacoara',
      address: 'Vila de Jericoacoara, Jijoca de Jericoacoara - CE',
      position: LatLng(-2.7956, -40.5142),
    ),
    RamoPlace(
      name: 'Preá',
      address: 'Preá, Cruz - CE',
      position: LatLng(-2.8157, -40.4126),
    ),
    RamoPlace(
      name: 'Jijoca de Jericoacoara',
      address: 'Jijoca de Jericoacoara - CE',
      position: LatLng(-2.8994, -40.4519),
    ),
    RamoPlace(
      name: 'Praia do Preá',
      address: 'Praia do Preá, Cruz - CE',
      position: LatLng(-2.8154, -40.4074),
    ),
    RamoPlace(
      name: 'Aeroporto Regional de Jericoacoara',
      address: 'Aeroporto JJD, Cruz - CE',
      position: LatLng(-2.9067, -40.3581),
    ),
    RamoPlace(
      name: 'Lagoa do Paraíso',
      address: 'Lagoa do Paraíso, Jijoca de Jericoacoara - CE',
      position: LatLng(-2.8657, -40.4531),
    ),
  ];

  static String _placeId(RamoPlace place) =>
      'preview-${place.name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-')}';

  static List<RamoPlace> _matches(String query) {
    final normalized = query.trim().toLowerCase();
    if (normalized.isEmpty) return const [];
    return _places
        .where(
          (place) =>
              place.name.toLowerCase().contains(normalized) ||
              place.address.toLowerCase().contains(normalized),
        )
        .toList(growable: false);
  }

  @override
  String beginSession() =>
      'preview-${DateTime.now().microsecondsSinceEpoch}';

  @override
  Future<List<PlaceAutocompleteSuggestion>> suggestions(
    String query, {
    required String sessionToken,
  }) async {
    if (sessionToken.trim().isEmpty) return const [];
    return _matches(query)
        .map(
          (place) => PlaceAutocompleteSuggestion(
            placeId: _placeId(place),
            mainText: place.name,
            secondaryText: place.address,
            localOnly: true,
          ),
        )
        .toList(growable: false);
  }

  @override
  Future<RamoPlace> resolve(
    PlaceAutocompleteSuggestion suggestion, {
    required String sessionToken,
  }) async {
    if (sessionToken.trim().isEmpty) {
      throw StateError('Sessão de busca Preview inválida.');
    }
    return _places.firstWhere(
      (place) => _placeId(place) == suggestion.placeId,
      orElse: () => throw StateError(
        'Esse destino não existe no catálogo Preview.',
      ),
    );
  }

  @override
  Future<List<RamoPlace>> search(String query) async {
    if (query.trim().length < 2) return const [];
    return _matches(query);
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
  final List<WalletTopupStatus> _topups = [];
  PassengerPromotionPreference? _promotionPreference;

  @override
  Future<PassengerPaymentPolicy> paymentPolicy() async =>
      const PassengerPaymentPolicy(
        cashEnabled: false,
        allowedMethods: {'pix', 'card', 'wallet'},
        paymentRequiredBeforeDispatch: true,
        passengerWalletEnabled: true,
      );

  @override
  Future<PassengerPromotionPreference?> promotionPreference() async =>
      _promotionPreference;

  @override
  Future<PassengerPromotionSaveResult> savePromotionCode(
    String code,
  ) async {
    final normalized = code.trim().toUpperCase();
    final campaign = PassengerPromotionCampaign(
      id: 'preview-promotion',
      code: normalized.isEmpty ? 'PREVIEW10' : normalized,
      name: 'Cupom Preview',
      kind: 'fixed_discount',
      valueCents: 1000,
      categories: const [],
    );
    final preference = PassengerPromotionPreference(
      campaign: campaign,
      updatedAt: DateTime.now(),
    );
    _promotionPreference = preference;
    return PassengerPromotionSaveResult(
      mode: 'ride_coupon',
      preference: preference,
    );
  }

  @override
  Future<void> clearPromotionPreference() async {
    _promotionPreference = null;
  }

  @override
  Future<PreparedRide> applyPromotionToRide({
    required String rideId,
    String? code,
  }) async {
    if (code != null && code.trim().isNotEmpty) {
      await savePromotionCode(code);
    }
    final preference = _promotionPreference;
    if (preference == null) {
      throw const PassengerPaymentException(
        'Nenhum cupom salvo para aplicar.',
      );
    }
    const normal = 4500;
    const discount = 1000;
    return PreparedRide(
      id: rideId,
      state: 'AWAITING_PAYMENT',
      baseAmountCents: normal,
      pickupCompensationCents: 0,
      totalAmountCents: normal,
      holdExpiresAt: DateTime.now().add(const Duration(minutes: 5)),
      promotion: const PreparedRidePromotion(
        campaignId: 'preview-promotion',
        code: 'PREVIEW10',
        name: 'Cupom Preview',
        kind: 'fixed_discount',
        normalTotalCents: normal,
        discountCents: discount,
        passengerPayableCents: normal - discount,
      ),
    );
  }

  @override
  Future<PreparedRide> removePromotionFromRide(String rideId) async {
    return PreparedRide(
      id: rideId,
      state: 'AWAITING_PAYMENT',
      baseAmountCents: 4500,
      pickupCompensationCents: 0,
      totalAmountCents: 4500,
      holdExpiresAt: DateTime.now().add(const Duration(minutes: 5)),
    );
  }

  @override
  Future<FullyPromotionalRidePaymentResult>
      confirmFullyPromotionalRide(String rideId) async {
    return FullyPromotionalRidePaymentResult(
      dispatchStatus: 'SEARCHING_DRIVER',
      paymentConfirmed: true,
      rideJson: {
        'id': rideId,
        'state': 'SEARCHING_DRIVER',
      },
    );
  }

  @override
  Future<int> walletBalanceCents() async => _walletCents;

  @override
  Future<PixWalletTopupResult> createPixWalletTopup({
    required int amountCents,
    required String idempotencyKey,
    required String payerEmail,
  }) async {
    final now = DateTime.now();
    final topup = WalletTopupStatus(
      id: 'preview-topup-${now.microsecondsSinceEpoch}',
      status: 'paid',
      amountCents: amountCents,
      createdAt: now,
      updatedAt: now,
    );
    _walletCents += amountCents;
    _topups.insert(0, topup);
    return PixWalletTopupResult(
      topup: topup,
      orderId: 'preview-wallet-order-${now.microsecondsSinceEpoch}',
      ticketUrl: 'https://example.invalid/preview-wallet-pix',
      qrCode: '',
      qrCodeBase64: '',
    );
  }

  @override
  Future<WalletTopupStatus> walletTopupStatus(String topupId) async {
    return _topups.firstWhere(
      (topup) => topup.id == topupId,
      orElse: () => throw StateError('Recarga preview não encontrada.'),
    );
  }

  @override
  Future<List<WalletTopupStatus>> walletTopups({int limit = 20}) async {
    return List<WalletTopupStatus>.unmodifiable(
      _topups.take(limit.clamp(1, 100).toInt()),
    );
  }

  @override
  Future<PixRidePaymentResult> createPixRidePayment({
    required String rideId,
    required String idempotencyKey,
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
  static const _driverPath = [
    LatLng(-2.8002, -40.5208),
    LatLng(-2.7998, -40.5197),
    LatLng(-2.7989, -40.5190),
    LatLng(-2.7985, -40.5178),
    LatLng(-2.7974, -40.5169),
    LatLng(-2.7967, -40.5155),
  ];
  final List<PassengerRideChatMessage> _chatMessages = [];

  @override
  Future<List<PassengerRideChatMessage>> rideMessages(String rideId) async =>
      List.unmodifiable(_chatMessages);

  @override
  Future<PassengerRideChatMessage> sendRideMessage({
    required String rideId,
    required String body,
  }) async {
    final message = PassengerRideChatMessage(
      id: 'preview-passenger-chat-${_chatMessages.length + 1}',
      rideId: rideId,
      senderType: 'passenger',
      senderId: 'preview-passenger',
      body: body.trim(),
      createdAt: DateTime.now(),
    );
    _chatMessages.add(message);
    return message;
  }

  @override
  Future<PassengerDriverRatingResult> rateDriver(
    String rideId,
    int stars,
  ) async {
    return PassengerDriverRatingResult(
      stars: stars,
      ratingAverage: 4.9,
      ratingCount: 128,
      duplicate: false,
    );
  }

  @override
  Future<PassengerRideTrackingSnapshot> tracking(String rideId) async {
    _checks += 1;
    final state = _checks < 3 ? 'SEARCHING_DRIVER' : 'DRIVER_ASSIGNED';
    final pathIndex =
        (_checks - 3).clamp(0, _driverPath.length - 1).toInt();
    final driverPoint = _driverPath[pathIndex];

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
              latitude: driverPoint.latitude,
              longitude: driverPoint.longitude,
              updatedAt: DateTime.now(),
              stale: false,
            )
          : null,
    );
  }
}


final class _PreviewPassengerActivityService
    implements PassengerActivityService {
  const _PreviewPassengerActivityService();

  @override
  Future<PassengerActivitySnapshot> fetch() async {
    return PassengerActivitySnapshot(
      total: 8,
      active: 0,
      completed: 7,
      cancelled: 1,
      completedAmountCents: 32600,
      rides: [
        PassengerActivityRide(
          id: 'preview-activity-1',
          state: 'COMPLETED',
          category: 'car',
          origin: 'Jericoacoara',
          destination: 'Preá',
          totalAmountCents: 4200,
          paymentMethod: 'pix',
          createdAt: DateTime(2026, 9, 23, 18, 30),
          updatedAt: DateTime(2026, 9, 23, 19, 5),
        ),
        PassengerActivityRide(
          id: 'preview-activity-2',
          state: 'COMPLETED',
          category: 'buggy',
          origin: 'Jericoacoara',
          destination: 'Jijoca',
          totalAmountCents: 6800,
          paymentMethod: 'card',
          createdAt: DateTime(2026, 9, 21, 14, 10),
          updatedAt: DateTime(2026, 9, 21, 15, 2),
        ),
      ],
    );
  }
}
