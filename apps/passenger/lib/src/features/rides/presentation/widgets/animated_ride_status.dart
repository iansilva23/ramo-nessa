import 'package:flutter/material.dart';

/// Small, accessible transition between ride status messages. Repeated
/// realtime updates with the same visible label never restart the animation.
class AnimatedRideStatus extends StatelessWidget {
  const AnimatedRideStatus({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    return Semantics(
      liveRegion: true,
      child: AnimatedSwitcher(
        duration: reduceMotion
            ? Duration.zero
            : const Duration(milliseconds: 240),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (child, animation) => FadeTransition(
          opacity: animation,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, .06),
              end: Offset.zero,
            ).animate(animation),
            child: child,
          ),
        ),
        child: Text(
          label,
          key: ValueKey<String>(label),
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w900,
              ),
        ),
      ),
    );
  }
}
