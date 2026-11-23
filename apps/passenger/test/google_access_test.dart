import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

class TestSocialAccess extends RamoSocialAccess {
  TestSocialAccess({
    required super.driver,
    this.hasPendingGoogleRedirect = false,
  }) : super(
         baseUri: Uri.https('example.test'),
         clientFactory: () => throw StateError('Unexpected network request'),
       );

  RamoSocialProvider? selected;
  @override
  final bool hasPendingGoogleRedirect;

  @override
  Future<RamoSocialResult?> resumeGoogleRedirect() async =>
      const RamoSocialResult({'next': 'link', 'email': 'pessoa@example.test'});

  @override
  List<RamoSocialProvider> get providers => RamoSocialProvider.values;

  @override
  Future<RamoSocialResult?> start(RamoSocialProvider provider) async {
    selected = provider;
    return const RamoSocialResult({
      'next': 'register',
      'fullName': 'Pessoa Teste',
    });
  }
}

void main() {
  for (final driver in [false, true]) {
    testWidgets('restores a pending Google redirect for driver=$driver', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: RamoPasswordAccessFlow(
            driver: driver,
            onLogin: (_) async {},
            onRegister: (_) async {},
            socialAccess: TestSocialAccess(
              driver: driver,
              hasPendingGoogleRedirect: true,
            ),
            onSocialAuthenticated: (_) async {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('pessoa@example.test'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
    testWidgets(
      '${driver ? 'driver' : 'passenger'} shows only Google and opens registration',
      (tester) async {
        final social = TestSocialAccess(driver: driver);
        await tester.pumpWidget(
          MaterialApp(
            home: RamoPasswordAccessFlow(
              driver: driver,
              onLogin: (_) async {},
              onRegister: (_) async {},
              socialAccess: social,
              onSocialAuthenticated: (_) async {},
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('auth-email-field')), findsOneWidget);
        expect(find.text('Lembrar minha senha'), findsOneWidget);
        final google = find.text('Google');
        expect(google, findsOneWidget);
        expect(find.text('Apple'), findsNothing);
        expect(find.text('Facebook'), findsNothing);
        await tester.ensureVisible(google);
        await tester.tap(google);
        await tester.pumpAndSettle();
        expect(social.selected, RamoSocialProvider.google);
        expect(find.text('Complete seu cadastro'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
