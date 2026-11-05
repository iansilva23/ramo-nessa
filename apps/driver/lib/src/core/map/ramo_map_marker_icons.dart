import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:ramo_design_system/ramo_design_system.dart';

IconData ramoVehicleIcon(String? category) => switch (category) {
      'moto' => Icons.two_wheeler_rounded,
      'delivery' => Icons.delivery_dining_rounded,
      'buggy' => Icons.toys_rounded,
      'comfort_black' => Icons.airport_shuttle_rounded,
      _ => Icons.directions_car_filled_rounded,
    };

Future<gm.BitmapDescriptor> buildRamoMapMarker({
  required IconData icon,
  String? assetName,
  Color background = const Color(0xFFFFC400),
  Color foreground = const Color(0xFF111111),
  Color border = Colors.white,
  double logicalSize = 54,
}) async {
  if (assetName != null) {
    try {
      final data = await rootBundle.load(assetName);
      return gm.BitmapDescriptor.bytes(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
        width: logicalSize,
        height: logicalSize,
      );
    } catch (_) {
      // O marcador vetorial abaixo mantém o mapa utilizável se o asset
      // estiver ausente ou corrompido em uma distribuição incompleta.
    }
  }

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  final center = Offset(logicalSize / 2, logicalSize / 2);
  final radius = logicalSize / 2 - 3;

  canvas.drawCircle(
    center.translate(0, 2),
    radius,
    Paint()
      ..color = const Color(0x33000000)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
  );
  canvas.drawCircle(
    center,
    radius,
    Paint()..color = border,
  );
  canvas.drawCircle(
    center,
    radius - 3,
    Paint()..color = background,
  );

  final painter = TextPainter(
    textDirection: TextDirection.ltr,
    text: TextSpan(
      text: String.fromCharCode(icon.codePoint),
      style: TextStyle(
        fontSize: logicalSize * .48,
        fontFamily: icon.fontFamily,
        package: icon.fontPackage,
        color: foreground,
      ),
    ),
  )..layout();

  painter.paint(
    canvas,
    Offset(
      center.dx - painter.width / 2,
      center.dy - painter.height / 2,
    ),
  );

  final picture = recorder.endRecording();
  final image = await picture.toImage(
    logicalSize.round(),
    logicalSize.round(),
  );
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();

  if (data == null) {
    return gm.BitmapDescriptor.defaultMarker;
  }

  final Uint8List bytes = data.buffer.asUint8List();
  return gm.BitmapDescriptor.bytes(
    bytes,
    width: logicalSize,
    height: logicalSize,
  );
}

String ramoVehicleMarkerAsset(String? category) =>
    RamoMapMarkerAssets.vehicle(category);

Future<gm.BitmapDescriptor?> buildRamoNavigationArrow() async {
  const size = 40.0;
  const density = 3;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder)..scale(density.toDouble());
  final arrow = Path()
    ..moveTo(20, 4)
    ..lineTo(33, 33)
    ..lineTo(20, 27)
    ..lineTo(7, 33)
    ..close();
  canvas.drawPath(arrow, Paint()..color = const Color(0xFF1A73E8));
  canvas.drawPath(
    arrow,
    Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeJoin = StrokeJoin.round,
  );
  final picture = recorder.endRecording();
  try {
    final pixels = (size * density).round();
    final image = await picture.toImage(pixels, pixels);
    try {
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) return null;
      return gm.BitmapDescriptor.bytes(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
        width: size,
        height: size,
      );
    } finally {
      image.dispose();
    }
  } catch (_) {
    return null;
  } finally {
    picture.dispose();
  }
}
