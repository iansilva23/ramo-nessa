import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_nessa_passenger/src/features/guide/data/local_guide_service.dart';
import 'package:ramo_nessa_passenger/src/features/guide/presentation/local_guide_screen.dart';
import 'local_guide_test.dart' show Service;

void main() {
  testWidgets('Guide follows app appearance through home, category and detail without losing navigation',(tester) async {
    tester.view.physicalSize=const Size(390,1000);tester.view.devicePixelRatio=1;
    addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
    final mode=ValueNotifier(ThemeMode.light);addTearDown(mode.dispose);
    final category=GuideEntry({'id':'tours','parentId':'jeri','kind':'category','name':'Passeios','template':'tours','summary':'Conheça a região'});
    final item=GuideEntry({'id':'tour','parentId':'tours','kind':'item','name':'Passeio de teste','summary':'Descrição breve','description':'Descrição completa do passeio.','priceCents':15000,'actions':[{'id':'contact','type':'whatsapp','label':'Reservar','primary':true},{'id':'instagram','type':'instagram','label':'Instagram'}]});
    final catalog=GuideCatalog(entries:[GuideEntry({'id':'jeri','kind':'locality','name':'Jericoacoara'}),category,item]);
    await tester.pumpWidget(ValueListenableBuilder<ThemeMode>(valueListenable:mode,builder:(context,value,_)=>MaterialApp(theme:RamoTheme.light,darkTheme:RamoTheme.dark,themeMode:value,home:LocalGuideScreen(service:Service(catalog),onDestination:(_){}))));
    await tester.pumpAndSettle();
    expect(Theme.of(tester.element(find.text('Guia Local'))).brightness,Brightness.light);
    expect(tester.widget<Scaffold>(find.byType(Scaffold).last).backgroundColor!.computeLuminance(),greaterThan(.9));
    await tester.tap(find.text('Passeios'));await tester.pumpAndSettle();
    expect(Theme.of(tester.element(find.text('Passeios'))).brightness,Brightness.light);
    await tester.tap(find.text('Passeio de teste'));await tester.pumpAndSettle();
    expect(Theme.of(tester.element(find.text('Descrição completa do passeio.'))).brightness,Brightness.light);
    final price=tester.widget<Text>(find.text('R\$ 150,00'));
    final contrast=(1.0+.05)/(price.style!.color!.computeLuminance()+.05);
    expect(contrast,greaterThanOrEqualTo(4.5));
    final secondary=tester.widget<OutlinedButton>(find.ancestor(of:find.text('Instagram'),matching:find.byWidgetPredicate((w)=>w is OutlinedButton)));
    expect(secondary.style!.foregroundColor!.resolve({})!.computeLuminance(),lessThan(.1));
    mode.value=ThemeMode.dark;await tester.pumpAndSettle();
    expect(Theme.of(tester.element(find.text('Descrição completa do passeio.'))).brightness,Brightness.dark);
    expect(tester.widget<Scaffold>(find.byType(Scaffold).last).backgroundColor!.computeLuminance(),lessThan(.02));
    await tester.tap(find.byTooltip('Voltar').last);await tester.pumpAndSettle();
    expect(find.text('Passeio de teste'),findsOneWidget);
    mode.value=ThemeMode.light;await tester.pumpAndSettle();
    expect(Theme.of(tester.element(find.text('Passeios'))).brightness,Brightness.light);
  });
}
