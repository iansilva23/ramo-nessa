import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../foundation/ramo_colors.dart';

/// Motion shared by passenger and driver; no animation can advance ride state.
class RamoReveal extends StatelessWidget {
  const RamoReveal({super.key, required this.child, this.delay = Duration.zero});
  final Widget child;
  final Duration delay;
  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    tween: Tween(begin: 0, end: 1),
    duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 420) + delay,
    curve: Interval(delay.inMilliseconds / (420 + delay.inMilliseconds), 1, curve: Curves.easeOutCubic),
    builder: (_, value, child) => Opacity(opacity: value,
      child: Transform.translate(offset: Offset(0, 16 * (1 - value)), child: child)),
    child: child,
  );
}

class RamoSearchPulse extends StatefulWidget {
  const RamoSearchPulse({super.key, this.label = 'Procurando motorista próximo…'});
  final String label;
  @override
  State<RamoSearchPulse> createState() => _RamoSearchPulseState();
}
class _RamoSearchPulseState extends State<RamoSearchPulse> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 2200));
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) { _controller.stop(); } else { _controller.repeat(); }
  }
  @override
  void dispose() { _controller.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => Semantics(label: widget.label, liveRegion: true,
    child: ExcludeSemantics(child: SizedBox.square(dimension: 160,
      child: AnimatedBuilder(animation: _controller, builder: (_, __) => CustomPaint(
        painter: _PulsePainter(_controller.value),
        child: const Center(child: Icon(Icons.my_location_rounded, size: 28, color: RamoColors.brandYellow)),
      )),
    )),
  );
}
class _PulsePainter extends CustomPainter {
  _PulsePainter(this.progress);
  final double progress;
  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    for (var i = 0; i < 3; i++) {
      final phase = (progress + i / 3) % 1;
      final paint = Paint()..color = RamoColors.brandYellow.withValues(alpha: .32 * (1 - phase))
        ..style = PaintingStyle.stroke..strokeWidth = 1.8;
      canvas.drawCircle(center, 22 + phase * 54, paint);
    }
    canvas.drawCircle(center, 23, Paint()..color = RamoColors.brandYellow.withValues(alpha: .12));
  }
  @override
  bool shouldRepaint(_PulsePainter old) => old.progress != progress;
}

class RamoSuccessMark extends StatelessWidget {
  const RamoSuccessMark({super.key, this.size = 64});
  final double size;
  @override
  Widget build(BuildContext context) => RamoReveal(child: Container(
    width: size, height: size,
    decoration: BoxDecoration(color: RamoColors.brandYellow, shape: BoxShape.circle,
      boxShadow: [BoxShadow(color: RamoColors.brandYellow.withValues(alpha: .18), blurRadius: 24)]),
    child: Icon(Icons.check_rounded, color: RamoColors.brandBlack, size: size * .58),
  ));
}

class RamoOfferCountdown extends StatelessWidget {
  const RamoOfferCountdown({super.key, required this.seconds, this.totalSeconds = 35});
  final int seconds;
  final int totalSeconds;
  @override
  Widget build(BuildContext context) => Semantics(label: '$seconds segundos para responder',
    child: ExcludeSemantics(child: SizedBox.square(dimension: 46, child: Stack(alignment: Alignment.center, children: [
      TweenAnimationBuilder<double>(tween: Tween(end: (seconds / math.max(1, totalSeconds)).clamp(0, 1)),
        duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 900),
        builder: (_, value, __) => SizedBox.square(dimension: 44, child: CircularProgressIndicator(
          value: value, strokeWidth: 3, backgroundColor: RamoColors.brandYellow.withValues(alpha: .12),
          color: seconds <= 8 ? Theme.of(context).colorScheme.error : RamoColors.brandYellow))),
      Text('${seconds}s', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
    ]))),
  );
}
