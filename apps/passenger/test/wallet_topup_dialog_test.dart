import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/passenger_payment_service.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/wallet_topup_result.dart';
import 'package:ramo_nessa_passenger/src/features/payments/presentation/passenger_wallet_screen.dart';

void main() {
  testWidgets('recarga fecha formulário e abre Pix sem descartar campos cedo',
      (tester) async {
    final service = _WalletService();
    await tester.pumpWidget(MaterialApp(
      home: PassengerWalletScreen(service: service),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Adicionar saldo via Pix'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), '10,50');
    await tester.enterText(find.byType(TextField).at(1), 'IAN@example.com');
    await tester.tap(find.text('Gerar Pix'));
    await tester.pump();
    expect(tester.takeException(), isNull);
    await tester.pump(const Duration(milliseconds: 100));
    expect(tester.takeException(), isNull);
    // The pending Pix screen intentionally keeps its progress indicator alive.
    // Advance past both route animations without waiting for it to settle.
    await tester.pump(const Duration(milliseconds: 500));
    expect(tester.takeException(), isNull);
    expect(find.text('Recarga via Pix'), findsOneWidget);
    expect(service.requests, 1);
    expect(service.amount, 1050);
    expect(service.email, 'ian@example.com');
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('cancelar recarga com campos preenchidos não cria pagamento',
      (tester) async {
    final service = _WalletService();
    await tester.pumpWidget(MaterialApp(
      home: PassengerWalletScreen(service: service),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Adicionar saldo via Pix'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '10');
    await tester.tap(find.text('Cancelar'));
    await tester.pump();
    expect(tester.takeException(), isNull);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(service.requests, 0);
    expect(find.byType(AlertDialog), findsNothing);
  });
}

class _WalletService implements PassengerPaymentService {
  int requests = 0;
  int? amount;
  String? email;
  final status = WalletTopupStatus(
    id: 'test-topup',
    status: 'pending',
    amountCents: 1050,
    createdAt: DateTime(2026),
    updatedAt: DateTime(2026),
  );

  @override
  Future<int> walletBalanceCents() async => 0;

  @override
  Future<List<WalletTopupStatus>> walletTopups({int limit = 20}) async => [];

  @override
  Future<WalletTopupStatus> walletTopupStatus(String topupId) async => status;

  @override
  Future<PixWalletTopupResult> createPixWalletTopup({
    required int amountCents,
    required String idempotencyKey,
    required String payerEmail,
  }) async {
    requests++;
    amount = amountCents;
    email = payerEmail;
    return PixWalletTopupResult(
      topup: status,
      orderId: 'test-order',
      ticketUrl: '',
      qrCode: 'test-pix-code',
      qrCodeBase64: '',
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
