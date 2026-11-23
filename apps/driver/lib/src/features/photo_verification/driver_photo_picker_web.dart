import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';
import 'dart:math' as math;

import 'package:web/web.dart' as browser;

import 'driver_verification_photo.dart';

Future<PreparedDriverPhoto?> pickDriverPhoto(
  DriverVerificationPhoto field, {
  required bool camera,
}) async {
  final input = browser.HTMLInputElement()
    ..type = 'file'
    ..accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
  if (camera) {
    input.setAttribute(
      'capture',
      field == DriverVerificationPhoto.portrait ? 'user' : 'environment',
    );
  }
  // Open directly from the source button to keep the browser's user activation.
  input.style.display = 'none';
  browser.document.body!.appendChild(input);
  final selection = Completer<browser.File?>();
  final change = ((browser.Event _) {
    if (!selection.isCompleted) selection.complete(input.files?.item(0));
  }).toJS;
  final cancel = ((browser.Event _) {
    if (!selection.isCompleted) selection.complete();
  }).toJS;
  input.addEventListener('change', change);
  input.addEventListener('cancel', cancel);
  browser.File? file;
  try {
    input.click();
    file = await selection.future;
  } finally {
    input.remove();
  }
  if (file == null) return null;
  return encodeBrowserDriverPhoto(field, file);
}

Future<PreparedDriverPhoto> encodeBrowserDriverPhoto(
  DriverVerificationPhoto field,
  browser.Blob source,
) async {
  if (source.size > 12 * 1024 * 1024) {
    throw const DriverPhotoException(DriverPhotoProblem.tooLarge);
  }

  late final browser.ImageBitmap bitmap;
  try {
    bitmap = await browser.window.createImageBitmap(source).toDart;
  } catch (_) {
    // Some browsers decode HEIC while others require exporting a JPEG first.
    throw const DriverPhotoException(DriverPhotoProblem.unsupported);
  }
  try {
    if (bitmap.width * bitmap.height > 24000000) {
      throw const DriverPhotoException(DriverPhotoProblem.tooLarge);
    }
    final ratio = math.min(
      1.0,
      field.maxSide / math.max(bitmap.width, bitmap.height),
    );
    final width = math.max(1, (bitmap.width * ratio).round());
    final height = math.max(1, (bitmap.height * ratio).round());
    final canvas = browser.HTMLCanvasElement()
      ..width = width
      ..height = height;
    final context =
        canvas.getContext('2d') as browser.CanvasRenderingContext2D?;
    if (context == null) {
      throw const DriverPhotoException(DriverPhotoProblem.invalid);
    }
    context
      ..fillStyle = '#fff'.toJS
      ..fillRect(0, 0, width, height)
      ..drawImage(bitmap, 0, 0, width, height);

    for (final quality in const [0.88, 0.82, 0.76, 0.70]) {
      final uri = canvas.toDataURL(
        PreparedDriverPhoto.contentType,
        quality.toJS,
      );
      if (!uri.startsWith('data:image/jpeg;base64,')) {
        throw const DriverPhotoException(DriverPhotoProblem.invalid);
      }
      final bytes = base64Decode(uri.substring(uri.indexOf(',') + 1));
      if (bytes.length <= field.targetBytes ||
          (quality == 0.70 && bytes.length <= field.maxBytes)) {
        return PreparedDriverPhoto(bytes, width, height);
      }
    }
    throw const DriverPhotoException(DriverPhotoProblem.exceedsUploadLimit);
  } finally {
    bitmap.close();
  }
}
