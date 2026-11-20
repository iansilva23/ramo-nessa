import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_nessa_driver/src/features/photo_verification/driver_photo_api.dart';
import 'package:ramo_nessa_driver/src/features/photo_verification/driver_photo_screen.dart';

void main() {
  testWidgets(
    'photo step fits narrow screens and expands correction guidance',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(340, 760));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final api = DriverPhotoApi(
        Uri.parse('https://example.invalid'),
        'test',
        MockClient((_) async => http.Response('', 404)),
      );
      final snapshot = DriverPhotoSnapshot.fromJson({
        'vehicleId': 'fixture',
        'vehicleRevision': 1,
        'photos': [
          {
            'type': 'portrait',
            'status': 'rejected',
            'reason': 'Rosto fora do enquadramento.',
          },
        ],
      });
      await tester.pumpWidget(
        MaterialApp(
          theme: RamoTheme.light,
          home: DriverPhotoScreen(api: api, initial: snapshot),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('0 de 5 fotos salvas'), findsOneWidget);
      expect(find.text('Reenvio solicitado'), findsOneWidget);
      await tester.tap(find.text('Foto do rosto'));
      await tester.pumpAndSettle();
      expect(find.text('Rosto fora do enquadramento.'), findsOneWidget);
      expect(find.text('Galeria'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
