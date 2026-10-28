import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../domain/driver_models.dart';

/// A short effect stays inside the campaign card; navigation controls stay usable.
class DriverCampaignNotice extends StatefulWidget {
  const DriverCampaignNotice({super.key, required this.presentation, this.compact = false, this.celebrateUntil});
  final DriverCampaignPresentation presentation;
  final bool compact;
  final DateTime? celebrateUntil;
  @override
  State<DriverCampaignNotice> createState() => _DriverCampaignNoticeState();
}

class _DriverCampaignNoticeState extends State<DriverCampaignNotice> with SingleTickerProviderStateMixin {
  late final AnimationController _effect = AnimationController(vsync: this, duration: const Duration(seconds: 2));
  bool _started = false;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final remaining = widget.celebrateUntil?.difference(DateTime.now());
    if (!_started && !widget.compact && !MediaQuery.disableAnimationsOf(context) &&
        widget.presentation.animation != 'none' && remaining != null && remaining > Duration.zero) {
      _started = true;
      _effect.duration = remaining > const Duration(seconds: 2) ? const Duration(seconds: 2) : remaining;
      _effect.forward();
    }
    if (MediaQuery.disableAnimationsOf(context)) _effect.stop();
  }
  @override
  void dispose() { _effect.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    final data = widget.presentation;
    return AnimatedBuilder(animation: _effect, builder: (context, _) => ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: CustomPaint(foregroundPainter: _CampaignSparkles(_effect.value, data.animation,
        _effect.isAnimating && !MediaQuery.disableAnimationsOf(context)),
        child: Container(width: double.infinity, padding: EdgeInsets.all(widget.compact ? 9 : 13),
          decoration: BoxDecoration(color: const Color(0xfffff3bb), border: Border.all(color: const Color(0xffe6bd35)), borderRadius: BorderRadius.circular(14)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(data.tag == 'influencer' ? Icons.photo_camera_outlined : Icons.auto_awesome, color: const Color(0xff755500), size: 21),
            const SizedBox(width: 9),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Text(data.label, style: const TextStyle(color: Color(0xff3d3009), fontWeight: FontWeight.w800)),
              if (!widget.compact && data.partnerName?.isNotEmpty == true) Text(data.partnerName!, style: const TextStyle(color: Color(0xff3d3009), fontWeight: FontWeight.w600)),
              if (!widget.compact && data.message?.isNotEmpty == true) Padding(padding: const EdgeInsets.only(top: 5),
                child: Text(data.message!, style: const TextStyle(color: Color(0xff3d3009), fontSize: 13))),
            ])),
          ])),
      ),
    ));
  }
}

class _CampaignSparkles extends CustomPainter {
  const _CampaignSparkles(this.progress, this.effect, this.active);
  final double progress;
  final String effect;
  final bool active;
  @override
  void paint(Canvas canvas, Size size) {
    if (!active || effect == 'none') return;
    final paint = Paint()..strokeWidth = 1.8;
    final opacity = math.sin(progress * math.pi).clamp(0.0, 1.0);
    for (var i = 0; i < 16; i++) {
      final x = size.width * ((i * .618 + progress * .08) % 1);
      final y = effect == 'confetti' ? ((i * 19 + progress * size.height * 1.7) % size.height) : size.height * ((i * .381) % 1);
      paint.color = [const Color(0xffd8a500), const Color(0xff855acd), const Color(0xff26a79b)][i % 3].withValues(alpha: opacity * .8);
      if (effect == 'flash') {
        final radius = 2 + 4 * math.sin((progress * 2 + i / 16) * math.pi).abs();
        canvas.drawLine(Offset(x - radius, y), Offset(x + radius, y), paint);
        canvas.drawLine(Offset(x, y - radius), Offset(x, y + radius), paint);
      } else {
        canvas.drawCircle(Offset(x, y), 2.3, paint);
      }
    }
  }
  @override
  bool shouldRepaint(_CampaignSparkles oldDelegate) => progress != oldDelegate.progress || active != oldDelegate.active || effect != oldDelegate.effect;
}
