import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image;
import 'package:ramo_nessa_driver/src/features/photo_verification/driver_verification_photo.dart';

void main() {
  test('keeps the complete vehicle frame within the upload limits', () async {
    final source = image.Image(width: 2000, height: 1000);
    final photo = await prepareDriverVerificationPhoto(
      DriverVerificationPhoto.vehicleRear,
      image.encodePng(source),
    );
    expect(photo.width, 1280);
    expect(photo.height, 640);
    expect(photo.bytes.length, lessThanOrEqualTo(150 * 1024));
    expect(image.decodeJpg(photo.bytes)?.width, 1280);
  });

  test('applies orientation and drops source EXIF before encoding', () async {
    final source = image.Image(width: 600, height: 400);
    source.exif.imageIfd.orientation = 6;
    final photo = await prepareDriverVerificationPhoto(
      DriverVerificationPhoto.portrait,
      image.encodeJpg(source),
    );
    expect(photo.width, 341);
    expect(photo.height, 512);
    expect(image.decodeJpg(photo.bytes)?.exif.imageIfd.orientation, isNull);
  });

  test('rejects oversized, unsupported and malformed local files', () async {
    Future<PreparedDriverPhoto> prepare(Uint8List bytes) =>
        prepareDriverVerificationPhoto(DriverVerificationPhoto.portrait, bytes);
    Matcher rejects(DriverPhotoProblem problem) => throwsA(
      isA<DriverPhotoException>().having(
        (error) => error.problem,
        'problem',
        problem,
      ),
    );

    await expectLater(
      prepare(Uint8List(12 * 1024 * 1024 + 1)),
      rejects(DriverPhotoProblem.tooLarge),
    );
    await expectLater(
      prepare(Uint8List.fromList([0x25, 0x50, 0x44, 0x46])),
      rejects(DriverPhotoProblem.unsupported),
    );
    await expectLater(
      prepare(Uint8List.fromList([0xff, 0xd8])),
      rejects(DriverPhotoProblem.invalid),
    );
  });
}
