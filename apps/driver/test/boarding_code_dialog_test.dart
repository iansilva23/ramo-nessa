import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/boarding_code_dialog.dart';
void main(){testWidgets('boarding asks for exactly three digits and never shows the secret to the driver',(tester)async{
 String? result;
 await tester.pumpWidget(MaterialApp(home:Builder(builder:(context)=>TextButton(onPressed:()async{result=await showDialog<String>(context:context,builder:(_)=>const BoardingCodeDialog(delivery:false,remainingAttempts:5));},child:const Text('Iniciar')))));
 await tester.tap(find.text('Iniciar'));await tester.pumpAndSettle();expect(find.textContaining('5 tentativas'),findsOneWidget);
 await tester.enterText(find.byType(TextField),'12');await tester.pump();expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,isNull);
 await tester.enterText(find.byType(TextField),'007');await tester.pump();await tester.tap(find.text('Validar e iniciar'));await tester.pumpAndSettle();expect(result,'007');
 });}
