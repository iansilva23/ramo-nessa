import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:ramo_nessa_driver/src/features/profile/presentation/driver_security_screen.dart';
import 'package:ramo_nessa_driver/src/features/profile/presentation/driver_privacy_screen.dart';
import 'package:ramo_nessa_driver/src/features/profile/data/driver_privacy_service.dart';

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/profile/presentation/driver_settings_screen.dart';
import 'package:ramo_nessa_driver/src/features/profile/presentation/driver_support_screen.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_api.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_models.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

void main() {
  testWidgets(
    'driver access: phone viewport, back navigation and rendered pages',
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
      ThemeData captureTheme(ThemeData value) {
        if (!font.existsSync()) return value;
        const family = 'AccessCapture';
        return value.copyWith(
          textTheme: value.textTheme.apply(fontFamily: family),
          primaryTextTheme: value.primaryTextTheme.apply(fontFamily: family),
          appBarTheme: value.appBarTheme.copyWith(
            titleTextStyle: value.appBarTheme.titleTextStyle
                ?.copyWith(fontFamily: family),
          ),
          listTileTheme: value.listTileTheme.copyWith(
            titleTextStyle: value.listTileTheme.titleTextStyle
                ?.copyWith(fontFamily: family),
            subtitleTextStyle: value.listTileTheme.subtitleTextStyle
                ?.copyWith(fontFamily: family),
          ),
          filledButtonTheme: FilledButtonThemeData(
            style: (value.filledButtonTheme.style ?? const ButtonStyle()).copyWith(
              textStyle: WidgetStatePropertyAll(
                (value.filledButtonTheme.style?.textStyle?.resolve({}) ??
                    value.textTheme.labelLarge ?? const TextStyle())
                    .copyWith(fontFamily: family),
              ),
            ),
          ),
          outlinedButtonTheme: OutlinedButtonThemeData(
            style: (value.outlinedButtonTheme.style ?? const ButtonStyle()).copyWith(
              textStyle: WidgetStatePropertyAll(
                (value.outlinedButtonTheme.style?.textStyle?.resolve({}) ??
                    value.textTheme.labelLarge ?? const TextStyle())
                    .copyWith(fontFamily: family),
              ),
            ),
          ),
        );
      }
      const captureKey = Key('capture');
      await tester.pumpWidget(
        RepaintBoundary(
          key: captureKey,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: captureTheme(theme),
            home: RamoPasswordAccessFlow(
              driver: true,
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
          File('${directory.path}/driver-$page.png')
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
        final screens = <String, Widget>{
          'security': DriverSecurityScreen(api: _SupportCaptureApi()),
          'privacy': DriverPrivacyScreen(service: _PrivacyCaptureService()),
          'settings': const DriverSettingsScreen(),
          'support': DriverSupportScreen(api: _SupportCaptureApi()),
          'notifications': RamoNotificationSettings(
            readPreference: () async => false,
            savePreference: (_) async => true,
            requestNotifications: () async => true,
            notificationHelp: () => 'Receba avisos de corridas, mensagens e pagamentos.',
          ),
        };
        for (final screen in screens.entries) {
          await tester.pumpWidget(
            RepaintBoundary(
              key: captureKey,
              child: MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: captureTheme(narrow ? RamoTheme.light : RamoTheme.dark),
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(
                    textScaler: TextScaler.linear(narrow ? 1.4 : 1),
                  ),
                  child: child!,
                ),
                home: screen.value,
              ),
            ),
          );
          await tester.pumpAndSettle();
          await shot('${screen.key}-${narrow ? 'phone' : 'desktop-dark'}');
        }
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
          driver: true,
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

class _SupportCaptureApi extends Fake implements DriverApi {
  @override
  Future<DriverSecuritySnapshot> security() async => DriverSecuritySnapshot(
    sessionId: 'capture', subjectType: 'driver',
    createdAt: DateTime(2026, 11, 5), expiresAt: DateTime(2026, 12, 5),
  );
  @override
  Future<DriverSupportSnapshot> supportTickets() async =>
      const DriverSupportSnapshot(tickets: []);
}


class _PrivacyCaptureService implements DriverPrivacyService {
  bool marketingEnabled = false;
  bool failOverview = false;
  String? acceptedDocumentType;
  int? acceptedVersion;
  final List<DriverPrivacyRequest> requests = [];

  @override
  Future<DriverPrivacyOverview> overview() async {
    if (failOverview) throw Exception("Offline");
    return DriverPrivacyOverview(
      legalDocuments: [
        DriverLegalDocument(
          documentType: 'terms_of_use',
          version: 2,
          title: 'Termos de Uso',
          content:
              'Documento jurídico publicado pelo Core para validar a tela do motorista.',
          effectiveAt: DateTime.utc(2026, 9, 28),
          accepted: acceptedDocumentType == 'terms_of_use' &&
              acceptedVersion == 2,
          acceptedAt: acceptedDocumentType == null
              ? null
              : DateTime.utc(2026, 9, 28, 14),
        ),
      ],
      preferences: DriverPrivacyPreferences(
        marketingNotificationsEnabled: marketingEnabled,
        updatedAt: DateTime.utc(2026, 9, 28),
      ),
      requests: List.unmodifiable(requests),
    );
  }

  @override
  Future<void> acceptLegalDocument({
    required String documentType,
    required int version,
  }) async {
    acceptedDocumentType = documentType;
    acceptedVersion = version;
  }

  @override
  Future<DriverPrivacyRequest> createRequest({
    required String requestType,
    String? note,
  }) async {
    final request = DriverPrivacyRequest(
      id: 'driver-privacy-request-test',
      requestType: requestType,
      status: 'open',
      note: note,
      createdAt: DateTime.utc(2026, 9, 28, 14, 20),
      updatedAt: DateTime.utc(2026, 9, 28, 14, 20),
    );
    requests.add(request);
    return request;
  }

  @override
  Future<DriverPrivacyPreferences> updateMarketingNotifications(
    bool enabled,
  ) async {
    marketingEnabled = enabled;
    return DriverPrivacyPreferences(
      marketingNotificationsEnabled: enabled,
      updatedAt: DateTime.utc(2026, 9, 28, 14, 10),
    );
  }
}

