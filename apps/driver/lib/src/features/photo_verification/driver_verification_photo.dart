import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as image;

enum DriverVerificationPhoto {
  portrait('portrait', 512, 60 * 1024, 256 * 1024),
  vehicleFront('vehicle_front', 1280, 150 * 1024, 500 * 1024),
  vehicleRear('vehicle_rear', 1280, 150 * 1024, 500 * 1024),
  vehicleLeft('vehicle_left', 1024, 100 * 1024, 300 * 1024),
  vehicleRight('vehicle_right', 1024, 100 * 1024, 300 * 1024);

  const DriverVerificationPhoto(
    this.field,
    this.maxSide,
    this.targetBytes,
    this.maxBytes,
  );

  final String field;
  final int maxSide;
  final int targetBytes;
  final int maxBytes;
}

enum DriverPhotoProblem {
  tooLarge('Escolha uma foto de até 12 MB e 24 megapixels.'),
  unsupported(
    'Escolha uma foto JPEG, PNG ou WebP. Se estiver em HEIC, exporte como JPEG.',
  ),
  invalid('Não foi possível abrir a foto. Escolha outra imagem.'),
  exceedsUploadLimit(
    'Não foi possível reduzir esta foto sem perder muita qualidade. Escolha outra imagem.',
  );

  const DriverPhotoProblem(this.message);

  final String message;
}

class DriverPhotoException implements Exception {
  const DriverPhotoException(this.problem);

  final DriverPhotoProblem problem;
}

class PreparedDriverPhoto {
  const PreparedDriverPhoto(this.bytes, this.width, this.height);

  static const contentType = 'image/jpeg';

  final Uint8List bytes;
  final int width;
  final int height;
}

/// Encodes a single camera or gallery image before an upload is attempted.
Future<PreparedDriverPhoto> prepareDriverVerificationPhoto(
  DriverVerificationPhoto field,
  Uint8List input,
) => compute(_encodePhoto, (field, input));

PreparedDriverPhoto _encodePhoto((DriverVerificationPhoto, Uint8List) request) {
  final (field, input) = request;
  if (input.length > 12 * 1024 * 1024) {
    throw const DriverPhotoException(DriverPhotoProblem.tooLarge);
  }

  final decoder = _photoDecoder(input);
  if (decoder == null) {
    throw const DriverPhotoException(DriverPhotoProblem.unsupported);
  }

  late final image.Image decoded;
  try {
    final info = decoder.startDecode(input);
    if (info == null || info.width < 1 || info.height < 1) {
      throw const DriverPhotoException(DriverPhotoProblem.invalid);
    }
    if (info.width * info.height > 24000000) {
      throw const DriverPhotoException(DriverPhotoProblem.tooLarge);
    }
    final frame = decoder.decodeFrame(0);
    if (frame == null) {
      throw const DriverPhotoException(DriverPhotoProblem.invalid);
    }
    decoded = frame;
  } on DriverPhotoException {
    rethrow;
  } catch (_) {
    throw const DriverPhotoException(DriverPhotoProblem.invalid);
  }

  final oriented = image.bakeOrientation(decoded);
  final longestSide = oriented.width >= oriented.height
      ? oriented.width
      : oriented.height;
  final resized = longestSide <= field.maxSide
      ? oriented
      : image.copyResize(
          oriented,
          width: (oriented.width * field.maxSide / longestSide).round().clamp(
            1,
            field.maxSide,
          ),
          height: (oriented.height * field.maxSide / longestSide).round().clamp(
            1,
            field.maxSide,
          ),
          interpolation: image.Interpolation.average,
        );
  // A new RGB canvas preserves only pixels, removing source metadata.
  final clean = image.Image(width: resized.width, height: resized.height);
  image.fill(clean, color: image.ColorRgb8(255, 255, 255));
  image.compositeImage(clean, resized);

  for (final quality in const [88, 82, 76, 70]) {
    final bytes = image.encodeJpg(clean, quality: quality);
    if (bytes.length <= field.targetBytes ||
        (quality == 70 && bytes.length <= field.maxBytes)) {
      return PreparedDriverPhoto(bytes, clean.width, clean.height);
    }
  }
  throw const DriverPhotoException(DriverPhotoProblem.exceedsUploadLimit);
}

image.Decoder? _photoDecoder(Uint8List bytes) {
  if (bytes.length >= 2 && bytes[0] == 0xff && bytes[1] == 0xd8) {
    return image.JpegDecoder();
  }
  if (bytes.length >= 8 &&
      listEquals(bytes.sublist(0, 8), const [
        137,
        80,
        78,
        71,
        13,
        10,
        26,
        10,
      ])) {
    return image.PngDecoder();
  }
  if (bytes.length >= 12 &&
      listEquals(bytes.sublist(0, 4), const [82, 73, 70, 70]) &&
      listEquals(bytes.sublist(8, 12), const [87, 69, 66, 80])) {
    return image.WebPDecoder();
  }
  return null;
}
