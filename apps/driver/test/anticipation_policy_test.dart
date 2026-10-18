import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_api.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_models.dart';
import 'package:ramo_nessa_driver/src/features/finance/presentation/driver_wallet_screen.dart';

class _Api implements DriverApi {
  final finance = const DriverFinanceSummary(availableBalanceCents: 6000, payoutPendingCents: 0, anticipationMinimumCents: 5000, anticipationFeeCents: 500);
  @override
  Future<DriverFinanceSummary> financeSummary() async => finance;
  @override
  Future<DriverPayoutDestination> payoutDestination() async => const DriverPayoutDestination(configured: true, pixKeyType: 'random', pixKeyMasked: '••••1234');
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
void main() {
 test('finance summary accepts configured terms and preserves legacy defaults', () {
  final current = DriverFinanceSummary.fromJson({'availableBalanceCents': 6000,'payoutPendingCents': 0,'anticipationMinimumCents': 5000,'anticipationFeeCents': 500});
  expect(current.anticipationMinimumCents,5000);expect(current.anticipationFeeCents,500);
  final legacy = DriverFinanceSummary.fromJson({'availableBalanceCents': 0,'payoutPendingCents': 0});
  expect(legacy.anticipationMinimumCents,8000);expect(legacy.anticipationFeeCents,1000);
 });
 testWidgets('wallet enables anticipation at configured minimum and displays its fee', (tester) async {
  final api=_Api();
  await tester.pumpWidget(MaterialApp(home:DriverWalletScreen(api:api)));
  await tester.pumpAndSettle();
  final button=find.ancestor(of:find.text('Solicitar antecipação'),matching:find.byWidgetPredicate((widget)=>widget is FilledButton));
  await tester.ensureVisible(button);await tester.pumpAndSettle();
  expect(tester.widget<FilledButton>(button).onPressed,isNotNull);
  await tester.tap(button);await tester.pumpAndSettle();
  expect(find.text('Mínimo: R\$ 50,00'),findsOneWidget);
  expect(find.textContaining('taxa de R\$ 5,00'),findsOneWidget);
  await tester.enterText(find.byType(TextField),'49,99');
  await tester.tap(find.text('Continuar'));await tester.pumpAndSettle();
  expect(find.text('A antecipação mínima é de R\$ 50,00.'),findsOneWidget);
  expect(tester.takeException(),isNull);
 });
}
