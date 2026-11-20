import 'dart:convert';
import 'dart:js_interop';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image/image.dart' as image;
import 'package:ramo_nessa_driver/src/features/photo_verification/driver_photo_api.dart';
import 'package:ramo_nessa_driver/src/features/photo_verification/driver_photo_picker_web.dart';
import 'package:ramo_nessa_driver/src/features/photo_verification/driver_verification_photo.dart';
import 'package:web/web.dart' as web;

void main() {
  test(
    'browser prepares a gallery JPEG and PUT sends the prepared bytes',
    () async {
      final original = image.encodePng(image.Image(width: 1600, height: 800));
      final file = web.Blob(
        [original.toJS].toJS,
        web.BlobPropertyBag(type: 'image/png'),
      );
      final photo = await encodeBrowserDriverPhoto(
        DriverVerificationPhoto.vehicleRear,
        file,
      );
      expect((photo.width, photo.height), (1280, 640));
      expect(photo.bytes.length, lessThanOrEqualTo(150 * 1024));
      final client = MockClient((request) async {
        expect(request.method, 'PUT');
        expect(
          request.url.path,
          '/v1/driver/me/verification-photos/vehicle_rear',
        );
        expect(request.url.queryParameters['vehicle'], 'fixture:1');
        expect(request.headers['content-type'], 'image/jpeg');
        expect(request.bodyBytes, orderedEquals(photo.bytes));
        return http.Response(
          jsonEncode({'status': 'draft', 'reason': null}),
          201,
        );
      });
      final api = DriverPhotoApi(
        Uri.parse('https://example.invalid'),
        'fixture',
        client,
      );
      final snapshot = DriverPhotoSnapshot.fromJson({
        'vehicleId': 'fixture',
        'vehicleRevision': 1,
        'photos': <Object>[],
      });
      final saved = await api.upload(
        snapshot,
        DriverVerificationPhoto.vehicleRear,
        photo,
      );
      expect(
        snapshot
            .withPhoto(DriverVerificationPhoto.vehicleRear, saved)
            .photos['vehicle_rear']
            ?.status,
        'draft',
      );
    },
  );
}
