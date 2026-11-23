import 'package:flutter/material.dart';

/// Assinatura compacta da marca para uso dentro da interface.
///
/// Usa a arte oficial com fundo transparente e contraste adequado à tela.
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
    final foreground = inverse
        ? Colors.white
        : Theme.of(context).colorScheme.onSurface;
    final mark = foreground.computeLuminance() > 0.5 ? 'driver' : 'passenger';

    return Semantics(
      label: 'Ramo Nessa',
      image: true,
      child: ExcludeSemantics(
        child: Image.asset(
          'assets/auth/ramo_mark_$mark.png',
          package: 'ramo_design_system',
          width: compact ? 55 : 72,
          height: compact ? 32 : 42,
          fit: BoxFit.contain,
        ),
      ),
    );
  }
}
