import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
class Service implements RamoAccountDeletionService {
  bool eligible = true;
  int calls = 0;
  @override
  Future<RamoDeletionOverview> deletionOverview() async => RamoDeletionOverview(available:true,eligible:eligible,reason:eligible?null:'Saldo pendente: R\$ 12,34. Seu saldo será preservado.');
  @override
  Future<RamoDeletionResult> deleteOwnAccount() async {calls++;return const RamoDeletionResult(id:'synthetic-job',deleted:true);}
}
void main() {
  testWidgets('deletion requires explicit confirmation and cancellation makes no request',(tester) async {
    final service = Service();
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:RamoAccountDeletionSection(service:service))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Excluir minha conta'));await tester.pumpAndSettle();
    expect(service.calls,0);
    await tester.tap(find.text('Cancelar'));await tester.pumpAndSettle();expect(service.calls,0);
    await tester.tap(find.text('Excluir minha conta'));await tester.pumpAndSettle();
    await tester.tap(find.text('Excluir definitivamente'));await tester.pumpAndSettle();
    expect(service.calls,1);expect(find.text('Conta excluída'),findsOneWidget);
    await tester.tap(find.text('Entendi'));await tester.pumpAndSettle();
  });
  testWidgets('financial eligibility is checked again before confirmation',(tester) async {
    final service = Service();
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:RamoAccountDeletionSection(service:service))));
    await tester.pumpAndSettle();service.eligible=false;
    await tester.tap(find.text('Excluir minha conta'));await tester.pumpAndSettle();
    expect(find.textContaining('Saldo pendente'),findsOneWidget);expect(find.text('Excluir definitivamente'),findsNothing);expect(service.calls,0);
  });
}
