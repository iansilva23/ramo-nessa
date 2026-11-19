import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

class OccurrenceFixture implements RamoRideOccurrenceApi {
  final List<String> mutations=[];
  bool enabled=true;
  Map<String,dynamic> item={'id':'case','kind':'mechanical','status':'awaiting_passenger','revision':0,'driver_statement':'Problema mecânico confirmado.'};
  @override
  Future<Map<String,dynamic>> occurrenceRequest(String path,{String method='GET',Map<String,dynamic>? body}) async {
    if(method!='GET')mutations.add('$method $path');
    return {'enabled':enabled,'items':[item],'pickup':null};
  }
}
void main(){
 testWidgets('reopen only reads and missing GPS prevents automatic continuation', (tester)async{
  final api=OccurrenceFixture();
  await tester.pumpWidget(MaterialApp(home:Scaffold(body:SingleChildScrollView(child:RamoRideOccurrencePanel(api:api,rideId:'ride')))));
  await tester.pumpAndSettle();
  expect(api.mutations,isEmpty);expect(find.text('Local de embarque indisponível. Peça ajuda ao suporte para confirmar um ponto seguro.'),findsOneWidget);
  final button=tester.widget<FilledButton>(find.widgetWithText(FilledButton,'Continuar com outro motorista, sem nova cobrança'));
  expect(button.onPressed,isNull);
  await tester.pumpWidget(const SizedBox());
 });
 testWidgets('cash cannot request a bank refund or automatic replacement',(tester)async{
  final api=OccurrenceFixture()..item={'id':'case','kind':'cash','status':'awaiting_passenger','revision':0,'driver_statement':'Interrupção em dinheiro.'};
  await tester.pumpWidget(MaterialApp(home:Scaffold(body:SingleChildScrollView(child:RamoRideOccurrencePanel(api:api,rideId:'ride',paymentMethod:'cash')))));
  await tester.pumpAndSettle();expect(find.text('Solicitar devolução integral'),findsNothing);expect(find.text('Continuar com outro motorista, sem nova cobrança'),findsNothing);
  expect(find.text('Informar problema com a devolução'),findsOneWidget);expect(api.mutations,isEmpty);await tester.pumpWidget(const SizedBox());
 });
 testWidgets('disabled policy renders no actions and creates no mutations',(tester)async{
  final api=OccurrenceFixture()..enabled=false;
  await tester.pumpWidget(MaterialApp(home:Scaffold(body:RamoRideOccurrencePanel(api:api,rideId:'ride',driver:true))));
  await tester.pumpAndSettle();expect(find.text('Resolver ocorrência'),findsNothing);expect(api.mutations,isEmpty);await tester.pumpWidget(const SizedBox());
 });
}
