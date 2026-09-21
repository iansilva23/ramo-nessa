import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

/// Superfície visual temporária do mapa.
///
/// Não representa o mapa de produção. Foi criada para permitir desenvolver
/// design, motion e fluxos antes da escolha final do provedor de mapas.
class RamoMapPreview extends StatefulWidget {
  const RamoMapPreview({
    super.key,
    this.showRoute = false,
  });

  final bool showRoute;

  @override
  State<RamoMapPreview> createState() => _RamoMapPreviewState();
}

class _RamoMapPreviewState extends State<RamoMapPreview>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  )..repeat();

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;

    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, _) {
        return CustomPaint(
          painter: _MapPreviewPainter(
            progress: _pulse.value,
            dark: dark,
            showRoute: widget.showRoute,
          ),
          child: const SizedBox.expand(),
        );
      },
    );
  }
}

class _MapPreviewPainter extends CustomPainter {
  const _MapPreviewPainter({
    required this.progress,
    required this.dark,
    required this.showRoute,
  });

  final double progress;
  final bool dark;
  final bool showRoute;

  @override
  void paint(Canvas canvas, Size size) {
    final background = dark ? RamoColors.darkCanvas : RamoColors.mapLand;
    final road = dark ? const Color(0xFF202429) : Colors.white;
    final minorRoad = dark ? const Color(0xFF181C20) : const Color(0xFFE5E5DF);
    final route = dark ? RamoColors.signal : RamoColors.ink;

    canvas.drawRect(Offset.zero & size, Paint()..color = background);

    final roadPaint = Paint()
      ..color = minorRoad
      ..style = PaintingStyle.stroke
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round;

    for (var i = -2; i < 8; i++) {
      final y = size.height * (0.10 + i * 0.15);
      canvas.drawLine(
        Offset(-40, y),
        Offset(size.width + 40, y + size.height * 0.18),
        roadPaint,
      );
    }

    final majorRoad = Paint()
      ..color = road
      ..style = PaintingStyle.stroke
      ..strokeWidth = 24
      ..strokeCap = StrokeCap.round;

    canvas.drawLine(
      Offset(size.width * 0.20, -30),
      Offset(size.width * 0.52, size.height + 30),
      majorRoad,
    );
    canvas.drawLine(
      Offset(-30, size.height * 0.42),
      Offset(size.width + 30, size.height * 0.60),
      majorRoad,
    );

    final pickup = Offset(size.width * 0.46, size.height * 0.38);
    final destination = Offset(size.width * 0.72, size.height * 0.20);

    if (showRoute) {
      final path = Path()
        ..moveTo(pickup.dx, pickup.dy)
        ..cubicTo(
          size.width * 0.53,
          size.height * 0.30,
          size.width * 0.62,
          size.height * 0.30,
          destination.dx,
          destination.dy,
        );

      canvas.drawPath(
        path,
        Paint()
          ..color = route
          ..style = PaintingStyle.stroke
          ..strokeWidth = 5
          ..strokeCap = StrokeCap.round,
      );
    }

    final ringRadius = 18 + (progress * 34);
    canvas.drawCircle(
      pickup,
      ringRadius,
      Paint()..color = RamoColors.signal.withValues(alpha: 0.22 * (1 - progress)),
    );

    canvas.drawCircle(
      pickup,
      12,
      Paint()..color = RamoColors.ink,
    );
    canvas.drawCircle(
      pickup,
      6,
      Paint()..color = RamoColors.signal,
    );

    if (showRoute) {
      canvas.save();
      canvas.translate(destination.dx, destination.dy);
      canvas.rotate(math.pi / 4);
      canvas.drawRect(
        const Rect.fromCenter(center: Offset.zero, width: 16, height: 16),
        Paint()..color = route,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _MapPreviewPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.dark != dark ||
        oldDelegate.showRoute != showRoute;
  }
}
