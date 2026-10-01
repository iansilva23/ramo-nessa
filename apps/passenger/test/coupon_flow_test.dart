import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/passenger_payment_service.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/card_ride_payment_result.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/cash_ride_authorization_result.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/passenger_payment_policy.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/passenger_promotion.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/pix_ride_payment_result.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/wallet_ride_payment_result.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/wallet_topup_result.dart';
import 'package:ramo_nessa_passenger/src/features/payments/presentation/ride_payment_screen.dart';
import 'package:ramo_nessa_passenger/src/features/payments/presentation/passenger_coupons_screen.dart';
import 'package:ramo_nessa_passenger/src/features/rides/domain/prepared_ride.dart';

void main() {
  for (final failRefresh in [false, true]) {
    testWidgets(
      'crédito de carteira preserva cupom no perfil (refresh falha: $failRefresh)',
      (tester) async {
        final service = _CouponPaymentService(
          failRefresh: failRefresh,
          promotedRide: _discountedRide(
            kind: 'fixed_discount',
            discountCents: 5000,
            payableCents: 15000,
          ),
        );
        await tester.pumpWidget(
          MaterialApp(
            theme: RamoTheme.light,
            home: PassengerCouponsScreen(service: service),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.text('INFLU50'), findsOneWidget);
        await tester.enterText(
          find.byKey(const Key('passenger-coupon-code')),
          'WALLET7',
        );
        await tester.testTextInput.receiveAction(TextInputAction.done);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        tester.testTextInput.hide();
        await tester.pump(const Duration(milliseconds: 300));
        expect(service.walletCreditCalls, 1);
        expect(service.preferenceCalls, 2);
        expect(find.text('INFLU50'), findsOneWidget);
        expect(
          find.textContaining(r'R$ 7,00 de crédito promocional'),
          findsOneWidget,
        );
        expect(find.text('Nenhum cupom de corrida salvo.'), findsNothing);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
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
      final paymentScroll = find
          .descendant(
            of: find.byType(ListView),
            matching: find.byType(Scrollable),
          )
          .first;
      await tester.scrollUntilVisible(
        pixOption,
        300,
        scrollable: paymentScroll,
      );
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

      expect(
        find.byKey(const Key('payment-option-pix')),
        findsNothing,
      );
      final confirmButton =
          find.byKey(const Key('ride-payment-promotion-confirm'));
      final paymentScroll = find
          .descendant(
            of: find.byType(ListView),
            matching: find.byType(Scrollable),
          )
          .first;
      await tester.scrollUntilVisible(
        confirmButton,
        300,
        scrollable: paymentScroll,
      );
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Sua corrida ficou grátis'), findsOneWidget);
      expect(confirmButton, findsOneWidget);
      await tester.tap(confirmButton);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(service.confirmCalls, 1);
      expect(
        find.text('Corrida promocional confirmada'),
        findsOneWidget,
      );

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );
  for (final theme in <String, ThemeData>{
    'claro': RamoTheme.light,
    'escuro': RamoTheme.dark,
  }.entries) {
    testWidgets('cupom manual cabe no tema ${theme.key} em celular', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final service = _CouponPaymentService(
        savedCoupon: false,
        promotedRide: _discountedRide(
          kind: 'fixed_discount',
          discountCents: 5000,
          payableCents: 15000,
        ),
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: theme.value,
          home: RidePaymentScreen(
            ride: _normalRide(),
            paymentService: service,
            networkTilesEnabled: false,
          ),
        ),
      );
      await tester.pump();
      final apply = find.byKey(const Key('ride-payment-coupon-apply'));
      await tester.scrollUntilVisible(
        apply,
        200,
        scrollable: find
            .descendant(
              of: find.byType(ListView),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      expect(tester.takeException(), isNull);
      final button = tester.getRect(apply);
      expect(button.width.isFinite, isTrue);
      expect(button.right, lessThanOrEqualTo(360));
      await tester.enterText(
        find.byKey(const Key('ride-payment-coupon-code')),
        'INFLU50',
      );
      tester.testTextInput.hide();
      await tester.pump(const Duration(milliseconds: 300));
      await Scrollable.ensureVisible(tester.element(apply), alignment: .5);
      await tester.pump(const Duration(milliseconds: 100));
      expect(apply.hitTestable(), findsOneWidget);
      await tester.tap(apply);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(service.applyCalls, 1);
      expect(
        find.byKey(const Key('ride-payment-coupon-applied')),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    });
  }
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
  _CouponPaymentService({
    required this.promotedRide,
    this.savedCoupon = true,
    this.failRefresh = false,
  });

  final PreparedRide promotedRide;
  final bool savedCoupon;
  final bool failRefresh;
  int walletCreditCalls = 0;
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
        pixPriceAdjustmentBps: 99,
        cardPriceAdjustmentBps: 498,
      );

  @override
  Future<PassengerPromotionPreference?> promotionPreference() async {
    preferenceCalls += 1;
    if (failRefresh && preferenceCalls > 1) {
      throw StateError('simulated preference refresh failure');
    }
    return savedCoupon ? _preference : null;
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
    if (code == 'WALLET7') {
      walletCreditCalls += 1;
      return const PassengerPromotionSaveResult(
        mode: 'wallet_credit',
        walletCreditCents: 700,
      );
    }
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
