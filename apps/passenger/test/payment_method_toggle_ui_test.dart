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
    'tela de pagamento obedece métodos desligados pelo Admin',
    (tester) async {
      final service = _PolicyOnlyPaymentService();

      await tester.pumpWidget(
        MaterialApp(
          home: RidePaymentScreen(
            ride: PreparedRide(
              id: 'ride-payment-toggle',
              state: 'AWAITING_PAYMENT',
              baseAmountCents: 15000,
              pickupCompensationCents: 0,
              totalAmountCents: 15000,
              holdExpiresAt: DateTime.now().add(
                const Duration(minutes: 2),
              ),
            ),
            paymentService: service,
            networkTilesEnabled: false,
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(service.walletBalanceCalls, 0);
      expect(find.text('Indisponível no momento'), findsNWidgets(3));

      expect(
        _optionOpacity(tester, const Key('payment-option-pix')),
        .48,
      );
      expect(
        _optionOpacity(tester, const Key('payment-option-card')),
        .48,
      );
      expect(
        _optionOpacity(tester, const Key('payment-option-wallet')),
        .48,
      );
      expect(
        _optionOpacity(tester, const Key('payment-option-cash')),
        1,
      );

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );
}

double _optionOpacity(WidgetTester tester, Key key) {
  final option = find.byKey(key);
  expect(option, findsOneWidget);
  final opacity = find.descendant(
    of: option,
    matching: find.byType(AnimatedOpacity),
  );
  return tester.widget<AnimatedOpacity>(opacity).opacity;
}

abstract class _CouponAwarePaymentService
    implements PassengerPaymentService {
  @override
  Future<PassengerPromotionPreference?> promotionPreference() async => null;

  @override
  Future<PassengerPromotionSaveResult> savePromotionCode(String code) =>
      throw UnimplementedError();

  @override
  Future<void> clearPromotionPreference() async {}

  @override
  Future<PreparedRide> applyPromotionToRide({
    required String rideId,
    String? code,
  }) =>
      throw UnimplementedError();

  @override
  Future<PreparedRide> removePromotionFromRide(String rideId) =>
      throw UnimplementedError();

  @override
  Future<FullyPromotionalRidePaymentResult> confirmFullyPromotionalRide(
    String rideId,
  ) =>
      throw UnimplementedError();
}

class _PolicyOnlyPaymentService extends _CouponAwarePaymentService {
  int walletBalanceCalls = 0;

  @override
  Future<PassengerPaymentPolicy> paymentPolicy() async {
    return const PassengerPaymentPolicy(
      cashEnabled: true,
      allowedMethods: {'cash'},
      paymentRequiredBeforeDispatch: true,
      passengerWalletEnabled: false,
    );
  }

  @override
  Future<int> walletBalanceCents() async {
    walletBalanceCalls += 1;
    return 50000;
  }

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
