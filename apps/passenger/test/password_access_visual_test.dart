import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/profile/presentation/passenger_settings_screen.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

void main() {
  testWidgets(
    'passenger access: phone viewport, back navigation and rendered pages',
    (tester) async {
      tester.view.physicalSize = const Size(430, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final font = File('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
      final theme = RamoTheme.light;
      await tester.runAsync(() async {
        if (font.existsSync()) {
          final loader = FontLoader('AccessCapture');
          loader.addFont(Future.value(ByteData.sublistView(font.readAsBytesSync())));
          await loader.load();
        }
        final flutterRoot = Platform.environment['FLUTTER_ROOT'];
        if (flutterRoot != null) {
          final icons = File(
            '$flutterRoot/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
          );
          if (icons.existsSync()) {
            final loader = FontLoader('MaterialIcons');
            loader.addFont(Future.value(ByteData.sublistView(icons.readAsBytesSync())));
            await loader.load();
          }
        }
      });
      const captureKey = Key('capture');
      await tester.pumpWidget(
        RepaintBoundary(
          key: captureKey,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: font.existsSync()
                ? theme.copyWith(
                    textTheme: theme.textTheme.apply(fontFamily: 'AccessCapture'),
                    filledButtonTheme: FilledButtonThemeData(
                      style: (theme.filledButtonTheme.style ?? const ButtonStyle())
                          .copyWith(
                            textStyle: WidgetStatePropertyAll(
                              (theme.filledButtonTheme.style?.textStyle
                                          ?.resolve({}) ??
                                      theme.textTheme.labelLarge ??
                                      const TextStyle())
                                  .copyWith(fontFamily: 'AccessCapture'),
                            ),
                          ),
                    ),
                    outlinedButtonTheme: OutlinedButtonThemeData(
                      style: (theme.outlinedButtonTheme.style ?? const ButtonStyle())
                          .copyWith(
                            textStyle: WidgetStatePropertyAll(
                              (theme.outlinedButtonTheme.style?.textStyle
                                          ?.resolve({}) ??
                                      theme.textTheme.labelLarge ??
                                      const TextStyle())
                                  .copyWith(fontFamily: 'AccessCapture'),
                            ),
                          ),
                    ),
                  )
                : theme,
            home: RamoPasswordAccessFlow(
              driver: false,
              onLogin: (_) async {},
              onRegister: (_) async {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      Future<void> shot(String page) async {
        expect(tester.takeException(), isNull);
        await tester.runAsync(() async {
          final boundary = tester.renderObject<RenderRepaintBoundary>(
            find.byKey(captureKey),
          );
          final image = await boundary.toImage(pixelRatio: 1);
          final data = await image.toByteData(format: ui.ImageByteFormat.png);
          final directory = Directory('../../release/access-shots');
          directory.createSync(recursive: true);
          File('${directory.path}/passenger-$page.png')
              .writeAsBytesSync(data!.buffer.asUint8List());
          image.dispose();
        });
      }

      await shot('landing');
      await tester.tap(find.byKey(const Key('auth-login-button')));
      await tester.pumpAndSettle();
      await shot('login');
      final password = find.byKey(const Key('auth-password-field'));
      expect(tester.widget<TextField>(password).obscureText, isTrue);
      await tester.tap(find.byTooltip('Mostrar senha'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(password).obscureText, isFalse);
      await tester.tap(find.byTooltip('Ocultar senha'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(password).obscureText, isTrue);

      await tester.tap(find.byKey(const Key('auth-back-button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('auth-create-account-button')));
      await tester.pumpAndSettle();
      await shot('registration');
      await tester.ensureVisible(find.byKey(const Key('auth-primary-button')));
      await tester.pumpAndSettle();
      await shot('registration-bottom');
      for (final narrow in [true, false]) {
        tester.view.physicalSize = narrow
            ? const Size(320, 740)
            : const Size(1000, 900);
        await tester.pumpWidget(
          RepaintBoundary(
            key: captureKey,
            child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: (narrow ? RamoTheme.light : RamoTheme.dark).copyWith(
                textTheme: (narrow ? RamoTheme.light : RamoTheme.dark)
                    .textTheme.apply(
                      fontFamily: font.existsSync() ? 'AccessCapture' : null,
                    ),
              ),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: TextScaler.linear(narrow ? 1.4 : 1),
                ),
                child: child!,
              ),
              home: const PassengerSettingsScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Configurações'), findsOneWidget);
        expect(find.text('Configurações do aplicativo'), findsOneWidget);
        expect(find.text('Configurações de localização'), findsOneWidget);
        await shot(narrow ? 'settings-phone' : 'settings-desktop-dark');
      }

    },
  );
  testWidgets('pending login completion after leaving the screen is safe', (
    tester,
  ) async {
    final pending = Completer<void>();
    await tester.pumpWidget(
      MaterialApp(
        home: RamoPasswordAccessFlow(
          driver: false,
          onLogin: (_) => pending.future,
          onRegister: (_) async {},
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('auth-login-button')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('auth-email-field')),
      'account@example.test',
    );
    await tester.enterText(
      find.byKey(const Key('auth-password-field')),
      'Example12345',
    );
    await tester.ensureVisible(find.byKey(const Key('auth-primary-button')));
    await tester.tap(find.byKey(const Key('auth-primary-button')));
    await tester.pump();
    await tester.pumpWidget(const SizedBox());
    pending.complete();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
