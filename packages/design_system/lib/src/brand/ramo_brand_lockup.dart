import 'package:flutter/material.dart';

import '../foundation/ramo_colors.dart';
import '../foundation/ramo_tokens.dart';

/// Assinatura compacta da marca para uso dentro da interface.
///
/// Os ícones nativos das lojas usam os arquivos oficiais da marca. Este widget
/// serve para navegação e cabeçalhos, onde uma versão simples e responsiva é
/// mais legível do que o artwork completo.
class RamoBrandLockup extends StatelessWidget {
  const RamoBrandLockup({
    super.key,
    this.inverse = false,
    this.compact = false,
  });

  final bool inverse;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final foreground = inverse ? Colors.white : RamoColors.brandBlack;

    return Semantics(
      label: 'Ramo Nessa',
      image: true,
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox.square(
              dimension: compact ? 26 : 32,
              child: const CustomPaint(
                painter: _RamoMarkPainter(),
              ),
            ),
            SizedBox(width: compact ? RamoSpacing.xs : RamoSpacing.sm),
            Text(
              'RAMO NESSA',
              style: TextStyle(
                color: foreground,
                fontSize: compact ? 15 : 18,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.8,
                height: 1,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RamoMarkPainter extends CustomPainter {
  const _RamoMarkPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final black = Paint()..color = RamoColors.brandBlack;
    final yellow = Paint()..color = RamoColors.brandYellow;

    final center = Offset(size.width * 0.5, size.height * 0.39);
    final radius = size.width * 0.28;

    final pin = Path()
      ..moveTo(center.dx, size.height * 0.95)
      ..cubicTo(
        size.width * 0.42,
        size.height * 0.76,
        size.width * 0.19,
        size.height * 0.60,
        size.width * 0.19,
        size.height * 0.38,
      )
      ..cubicTo(
        size.width * 0.19,
        size.height * 0.14,
        size.width * 0.33,
        size.height * 0.04,
        center.dx,
        size.height * 0.04,
      )
      ..cubicTo(
        size.width * 0.67,
        size.height * 0.04,
        size.width * 0.81,
        size.height * 0.14,
        size.width * 0.81,
        size.height * 0.38,
      )
      ..cubicTo(
        size.width * 0.81,
        size.height * 0.60,
        size.width * 0.58,
        size.height * 0.76,
        center.dx,
        size.height * 0.95,
      )
      ..close();

    canvas.drawPath(pin, black);
    canvas.drawCircle(center, radius * 0.48, yellow);

    final route = Paint()
      ..color = RamoColors.brandYellow
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.width * 0.095
      ..strokeCap = StrokeCap.round;

    final routePath = Path()
      ..moveTo(size.width * 0.15, size.height * 0.73)
      ..quadraticBezierTo(
        size.width * 0.43,
        size.height * 0.59,
        size.width * 0.82,
        size.height * 0.71,
      );

    canvas.drawPath(routePath, route);
  }

  @override
  bool shouldRepaint(covariant _RamoMarkPainter oldDelegate) => false;
}
