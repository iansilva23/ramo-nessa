import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/payments/presentation/pix_exit_dialog.dart';

void main() {
  testWidgets('Pix notice remains usable with large text on a small phone', (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var action = '';
    await tester.pumpWidget(MaterialApp(
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(2)),
        child: child!),
      home: Scaffold(body: PixExitDialog(
        onContinue: () => action = 'continue',
        onVerify: () => action = 'verify',
        onLeave: () => action = 'leave',
      )),
    ));
    for (final item in <String, String>{
      'Continuar no pagamento': 'continue',
      'Já paguei · verificar': 'verify',
      'Não paguei · desistir': 'leave',
    }.entries) {
      await tester.ensureVisible(find.text(item.key));
      await tester.pumpAndSettle();
      await tester.tap(find.text(item.key));
      expect(action, item.value);
      expect(tester.takeException(), isNull);
    }
  });

  for (final dark in [false, true]) {
    testWidgets('capture premium Pix notice ${dark ? 'dark' : 'light'}', (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.runAsync(() async {
        final fonts = File('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
        if (fonts.existsSync()) {
          final loader = FontLoader('PixCapture');
          loader.addFont(Future.value(ByteData.sublistView(fonts.readAsBytesSync())));
          await loader.load();
        }
        final root = Platform.environment['FLUTTER_ROOT'];
        if (root != null) {
          final icons = File('$root/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
          if (icons.existsSync()) {
            final loader = FontLoader('MaterialIcons');
            loader.addFont(Future.value(ByteData.sublistView(icons.readAsBytesSync())));
            await loader.load();
          }
        }
      });
      const key = Key('pix-capture');
      final theme = ThemeData(brightness: dark ? Brightness.dark : Brightness.light,
        fontFamily: 'PixCapture', useMaterial3: true);
      await tester.pumpWidget(RepaintBoundary(key: key,
        child: MaterialApp(debugShowCheckedModeBanner: false, theme: theme,
          home: Builder(builder: (context) => Scaffold(
            backgroundColor: dark ? const Color(0xFF101414) : const Color(0xFFECEEE8),
            appBar: AppBar(title: const Text('Pagar com Pix')),
            body: Center(child: FilledButton(onPressed: () => showDialog<void>(
              context: context, builder: (_) => PixExitDialog(
                onContinue: () {}, onVerify: () {}, onLeave: () {})),
              child: const Text('Abrir aviso'))),
          )))));
      await tester.tap(find.text('Abrir aviso'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.runAsync(() async {
        final boundary = tester.renderObject<RenderRepaintBoundary>(find.byKey(key));
        final image = await boundary.toImage(pixelRatio: 2);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        final directory = Directory('../../release/pix-shots')..createSync(recursive: true);
        File('${directory.path}/pix-exit-${dark ? 'dark' : 'light'}.png')
            .writeAsBytesSync(bytes!.buffer.asUint8List());
        image.dispose();
      });
    });
  }
}
