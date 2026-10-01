import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/passenger_payment_service.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/card_ride_payment_result.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/cash_ride_authorization_result.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/passenger_payment_policy.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/passenger_promotion.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/pix_ride_payment_result.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/wallet_ride_payment_result.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/wallet_topup_result.dart';
import 'package:ramo_nessa_passenger/src/features/payments/presentation/ride_payment_screen.dart';
import 'package:ramo_nessa_passenger/src/features/rides/domain/prepared_ride.dart';

void main() {
  testWidgets(
    'cupom salvo é aplicado automaticamente e atualiza o preço',
    (tester) async {
      final service = _CouponPaymentService(
        promotedRide: _discountedRide(
          kind: 'fixed_discount',
          discountCents: 5000,
          payableCents: 15000,
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: RidePaymentScreen(
            ride: _normalRide(),
            paymentService: service,
            networkTilesEnabled: false,
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(service.preferenceCalls, 1);
      expect(service.applyCalls, 1);
      expect(
        find.byKey(const Key('ride-payment-coupon-applied')),
        findsOneWidget,
      );
      expect(find.text('INFLU50'), findsOneWidget);
      expect(find.text(r'R$ 150,00'), findsWidgets);
      expect(find.textContaining(r'Preço normal: R$ 200,00'), findsOneWidget);

      final pixOption =
          find.byKey(const Key('payment-option-pix'));
      await tester.ensureVisible(pixOption);
      await tester.pump(const Duration(milliseconds: 100));
      expect(
        find.descendant(
          of: pixOption,
          matching: find.text(r'Pix · R$ 150,00'),
        ),
        findsOneWidget,
      );

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );

  testWidgets(
    'cupom que zera a corrida remove cobrança e confirma promoção',
    (tester) async {
      final service = _CouponPaymentService(
        promotedRide: _discountedRide(
          kind: 'free_ride',
          discountCents: 20000,
          payableCents: 0,
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: RidePaymentScreen(
            ride: _normalRide(),
            paymentService: service,
            networkTilesEnabled: false,
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Sua corrida ficou grátis'), findsOneWidget);
      expect(
        find.byKey(const Key('payment-option-pix')),
        findsNothing,
      );
      expect(
        find.byKey(const Key('ride-payment-promotion-confirm')),
        findsOneWidget,
      );

      final confirmButton =
          find.byKey(const Key('ride-payment-promotion-confirm'));
      await tester.ensureVisible(confirmButton);
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tap(confirmButton);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(service.confirmCalls, 1);
      expect(
        find.text('Corrida promocional confirmada'),
        findsOneWidget,
      );

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );
}

PreparedRide _normalRide() {
  return PreparedRide(
    id: 'ride-coupon-test',
    state: 'AWAITING_PAYMENT',
    baseAmountCents: 20000,
    pickupCompensationCents: 0,
    totalAmountCents: 20000,
    holdExpiresAt: DateTime.now().add(const Duration(minutes: 2)),
  );
}

PreparedRide _discountedRide({
  required String kind,
  required int discountCents,
  required int payableCents,
}) {
  return PreparedRide(
    id: 'ride-coupon-test',
    state: 'AWAITING_PAYMENT',
    baseAmountCents: 20000,
    pickupCompensationCents: 0,
    totalAmountCents: 20000,
    holdExpiresAt: DateTime.now().add(const Duration(minutes: 2)),
    promotion: PreparedRidePromotion(
      campaignId: 'campaign-1',
      code: 'INFLU50',
      name: 'Influenciador',
      kind: kind,
      normalTotalCents: 20000,
      discountCents: discountCents,
      passengerPayableCents: payableCents,
    ),
  );
}

class _CouponPaymentService implements PassengerPaymentService {
  _CouponPaymentService({required this.promotedRide});

  final PreparedRide promotedRide;
  int preferenceCalls = 0;
  int applyCalls = 0;
  int confirmCalls = 0;

  PassengerPromotionPreference get _preference =>
      PassengerPromotionPreference(
        campaign: const PassengerPromotionCampaign(
          id: 'campaign-1',
          code: 'INFLU50',
          name: 'Influenciador',
          kind: 'fixed_discount',
          valueCents: 5000,
          categories: <String>[],
        ),
        updatedAt: DateTime(2026, 10, 1),
      );

  @override
  Future<PassengerPaymentPolicy> paymentPolicy() async =>
      const PassengerPaymentPolicy(
        cashEnabled: false,
        allowedMethods: {'pix', 'card', 'wallet'},
        paymentRequiredBeforeDispatch: true,
        passengerWalletEnabled: true,
        pixPriceAdjustmentBps: 0,
        cardPriceAdjustmentBps: 0,
      );

  @override
  Future<PassengerPromotionPreference?> promotionPreference() async {
    preferenceCalls += 1;
    return _preference;
  }

  @override
  Future<PreparedRide> applyPromotionToRide({
    required String rideId,
    String? code,
  }) async {
    applyCalls += 1;
    return promotedRide;
  }

  @override
  Future<PassengerPromotionSaveResult> savePromotionCode(String code) async {
    return PassengerPromotionSaveResult(
      mode: 'ride_coupon',
      preference: _preference,
    );
  }

  @override
  Future<void> clearPromotionPreference() async {}

  @override
  Future<PreparedRide> removePromotionFromRide(String rideId) async =>
      _normalRide();

  @override
  Future<FullyPromotionalRidePaymentResult>
      confirmFullyPromotionalRide(String rideId) async {
    confirmCalls += 1;
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
  Future<int> walletBalanceCents() async => 50000;

  @override
  Future<PixWalletTopupResult> createPixWalletTopup({
    required int amountCents,
    required String idempotencyKey,
    required String payerEmail,
  }) =>
      throw UnimplementedError();

  @override
  Future<WalletTopupStatus> walletTopupStatus(String topupId) =>
      throw UnimplementedError();

  @override
  Future<List<WalletTopupStatus>> walletTopups({int limit = 20}) =>
      throw UnimplementedError();

  @override
  Future<PixRidePaymentResult> createPixRidePayment({
    required String rideId,
    required String idempotencyKey,
  }) =>
      throw UnimplementedError();

  @override
  Future<CardRidePaymentResult> createCardRidePayment({
    required String rideId,
    required String idempotencyKey,
    required String cardToken,
    required String paymentMethodId,
    required String paymentMethodType,
    int installments = 1,
  }) =>
      throw UnimplementedError();

  @override
  Future<CashRideAuthorizationResult> authorizeCashRide({
    required String rideId,
    required String idempotencyKey,
  }) =>
      throw UnimplementedError();

  @override
  Future<WalletRidePaymentResult> payRideWithWallet({
    required String rideId,
    required String idempotencyKey,
  }) =>
      throw UnimplementedError();
}