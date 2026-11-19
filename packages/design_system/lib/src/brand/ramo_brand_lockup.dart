import 'package:flutter/material.dart';

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
    final foreground = inverse ? Colors.white : Theme.of(context).colorScheme.onSurface;
    final mark = foreground.computeLuminance() > 0.5 ? 'driver' : 'passenger';

    return Semantics(
      label: 'Ramo Nessa',
      image: true,
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox.square(
              dimension: compact ? 26 : 32,
              child: Image.asset(
                'assets/auth/ramo_mark_$mark.png',
                package: 'ramo_design_system',
                fit: BoxFit.contain,
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
