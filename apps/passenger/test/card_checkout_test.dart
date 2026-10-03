import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/payments/presentation/card_checkout_screen.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/card_tokenization_service.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/saved_card_service.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/card_ride_payment_result.dart';

class _Tokenizer implements CardTokenizationService {
  int calls = 0;
  @override
  Future<CardTokenizationResult> tokenize() async { calls++; return const CardTokenizationResult(
    token:'test-token-long-enough-for-payment',paymentMethodId:'visa',paymentMethodType:'credit_card',lastFourDigits:'1234'); }
}
class _StoredCards implements SavedCardService {
  String? savedToken;
  int paymentCalls = 0;
  @override
  Future<List<SavedPassengerCard>> savedCards() async => [const SavedPassengerCard(id:'card-1',lastFourDigits:'1234',paymentMethodId:'visa',paymentMethodType:'credit_card')];
  @override
  Future<SavedPassengerCard> saveCard({required String token, required String payerEmail}) async {
    savedToken = token;
    return const SavedPassengerCard(id:'card-2',lastFourDigits:'5678',paymentMethodId:'visa',paymentMethodType:'credit_card');
  }
  @override
  Future<void> removeCard(String id) async {}
  @override
  Future<CardRidePaymentResult> payWithCard({required String rideId,required String idempotencyKey,
    required CardTokenizationResult card,required String payerEmail,String? savedCardId}) async {
    paymentCalls++; throw StateError('Registration cannot charge');
  }
}
class _SavedTokenizer extends _Tokenizer implements SavedCardTokenizationService, StorageCardTokenizationService {
  String? reusedCard;
  @override
  Future<CardTokenizationResult> tokenizeSavedCard(SavedPassengerCard card) async {
    reusedCard = card.id;
    return const CardTokenizationResult(token:'fresh-payment-token-from-cvv',paymentMethodId:'visa',paymentMethodType:'credit_card',lastFourDigits:'1234');
  }
  @override
  Future<CardTokenizationResult> tokenizeForStorage() async => const CardTokenizationResult(
    token:'fresh-token-only-for-payment',storageToken:'separate-token-only-for-storage',paymentMethodId:'visa',paymentMethodType:'credit_card',lastFourDigits:'5678');
}
void main() {
  testWidgets('adding a card requires email and does not confirm payment until explicit review', (tester) async {
    final tokenizer = _Tokenizer();
    CardCheckoutSelection? result;
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) => Scaffold(body: TextButton(
      onPressed: () async { result = await Navigator.of(context).push<CardCheckoutSelection>(MaterialPageRoute(builder: (_) => CardCheckoutScreen(
        tokenizer:tokenizer,amountLabel:r'R$ 40,00',holdExpiresAt:DateTime.now().add(const Duration(minutes:2))))); }, child:const Text('Abrir'))))));
    await tester.tap(find.text('Abrir')); await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Adicionar cartão')); await tester.tap(find.text('Adicionar cartão')); await tester.pump();
    expect(tokenizer.calls,0);
    await tester.enterText(find.byType(TextFormField),'ian@example.com');
    await tester.ensureVisible(find.text('Adicionar cartão')); await tester.tap(find.text('Adicionar cartão')); await tester.pumpAndSettle();
    expect(tokenizer.calls,1); expect(result,isNull);
    expect(find.textContaining('1234'),findsOneWidget);
    await tester.ensureVisible(find.text(r'Pagar R$ 40,00')); await tester.tap(find.text(r'Pagar R$ 40,00')); await tester.pumpAndSettle();
    expect(result?.email,'ian@example.com'); expect(result?.card.lastFourDigits,'1234');
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('saving is opt-in and uses a separate token without charging', (tester) async {
    final cards = _StoredCards(); final tokenizer = _SavedTokenizer();
    await tester.pumpWidget(MaterialApp(home:CardCheckoutScreen(tokenizer:tokenizer,cards:cards,
      amountLabel:r'R$ 40,00',holdExpiresAt:DateTime.now().add(const Duration(minutes:2)))));
    await tester.pumpAndSettle();
    expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value,isFalse);
    await tester.enterText(find.byType(TextFormField),'ian@example.com');
    await tester.ensureVisible(find.byType(SwitchListTile)); await tester.tap(find.byType(SwitchListTile)); await tester.pump();
    await tester.ensureVisible(find.text('Adicionar cartão')); await tester.tap(find.text('Adicionar cartão')); await tester.pumpAndSettle();
    expect(cards.savedToken,'separate-token-only-for-storage'); expect(cards.paymentCalls,0);
    expect(find.textContaining('5678'),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('expired hold disables card registration and payment', (tester) async {
    final tokenizer = _Tokenizer();
    await tester.pumpWidget(MaterialApp(home:CardCheckoutScreen(tokenizer:tokenizer,amountLabel:r'R$ 40,00',holdExpiresAt:DateTime.now().subtract(const Duration(seconds:1)))));
    await tester.pumpAndSettle();
    expect(find.textContaining('Reserva expirada'),findsOneWidget);
    expect(tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,isNull);
    expect(tokenizer.calls,0);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
