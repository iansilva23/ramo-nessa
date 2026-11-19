import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
class Service implements RamoAccountDeletionService {
  bool eligible = true;
  int calls = 0;
  String? requestId;
  @override
  Future<RamoDeletionOverview> deletionOverview() async => RamoDeletionOverview(available:true,eligible:eligible,requestId:requestId,reason:eligible?null:'Saldo pendente: R\$ 12,34. Seu saldo será preservado.');
  @override
  Future<RamoDeletionResult> deleteOwnAccount() async {calls++;if(!eligible){requestId='synthetic-job';return const RamoDeletionResult(id:'synthetic-job',deleted:false,waiting:true);}return const RamoDeletionResult(id:'synthetic-job',deleted:true);}
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
    expect(find.textContaining('Saldo pendente'),findsOneWidget);expect(find.text('Excluir definitivamente'),findsNothing);expect(find.text('Registrar solicitação'),findsOneWidget);expect(service.calls,0);
    await tester.tap(find.text('Cancelar'));await tester.pumpAndSettle();expect(service.calls,0);
  });
  testWidgets('a balance request is confirmed, tracked and keeps access for settlement',(tester) async {
    final service=Service()..eligible=false;
    var logouts=0;
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:RamoAccountDeletionSection(service:service,onClosed:()async{logouts++;}))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Excluir minha conta'));await tester.pumpAndSettle();
    expect(service.calls,0);
    await tester.tap(find.text('Registrar solicitação'));await tester.pumpAndSettle();
    expect(service.calls,1);expect(find.text('Solicitação registrada'),findsOneWidget);
    await tester.tap(find.text('Entendi'));await tester.pumpAndSettle();
    expect(logouts,0);expect(find.textContaining('Protocolo: synthetic-job'),findsOneWidget);
    final button=tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton,'Solicitação registrada'));
    expect(button.onPressed,isNull);
  });

}
