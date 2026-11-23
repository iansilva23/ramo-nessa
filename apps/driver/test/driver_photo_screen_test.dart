import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_nessa_driver/src/features/photo_verification/driver_photo_api.dart';
import 'package:ramo_nessa_driver/src/features/photo_verification/driver_photo_screen.dart';

void main() {
  test('fetches the approved avatar using the driver session', () async {
    final jpeg = Uint8List.fromList([0xff, 0xd8, 0xff, 0xd9]);
    var found = false;
    final api = DriverPhotoApi(
      Uri.parse('https://example.invalid'),
      'test-session',
      MockClient((request) async {
        expect(request.method, 'GET');
        expect(request.url.path, '/v1/driver/me/verification-photos/avatar');
        expect(request.headers['authorization'], 'Bearer test-session');
        return found
            ? http.Response.bytes(
                jpeg,
                200,
                headers: {'content-type': 'image/jpeg'},
              )
            : http.Response('', 404);
      }),
    );
    expect(await api.approvedAvatar(), isNull);
    found = true;
    expect(await api.approvedAvatar(), jpeg);
  });


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
