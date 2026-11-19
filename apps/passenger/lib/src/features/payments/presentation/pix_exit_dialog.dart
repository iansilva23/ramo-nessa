import 'package:flutter/material.dart';

/// Presentation only. Payment polling and reservation ownership stay in the screen.
class PixExitDialog extends StatelessWidget {
  const PixExitDialog({
    super.key,
    this.checking = false,
    this.onContinue,
    this.onVerify,
    this.onLeave,
  });

  final bool checking;
  final VoidCallback? onContinue;
  final VoidCallback? onVerify;
  final VoidCallback? onLeave;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    const yellow = Color(0xFFFFD600);
    final ink = dark ? const Color(0xFFF7F5EE) : const Color(0xFF171A1B);
    final muted = dark ? const Color(0xFFBFC3C1) : const Color(0xFF626967);
    final surface = dark ? const Color(0xFF1B2020) : Colors.white;
    final soft = dark ? const Color(0xFF262D2B) : const Color(0xFFF5F6F2);
    final border = dark ? const Color(0xFF39403B) : const Color(0xFFE6E9E1);

    final buttonStyle = FilledButton.styleFrom(
      backgroundColor: yellow,
      foregroundColor: const Color(0xFF171A1B),
      minimumSize: const Size.fromHeight(54),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
    );

    return Dialog(
      backgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(28),
        side: BorderSide(color: border),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400),
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(children: [
                  Container(
                    padding: const EdgeInsets.all(15),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFFFFE971), yellow],
                      ),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(Icons.pix_rounded,
                        size: 28, color: Color(0xFF171A1B)),
                  ),
                  const SizedBox(width: 14),
                  Expanded(child: Text('PAGAMENTO PIX',
                    style: TextStyle(color: muted, fontSize: 11,
                      fontWeight: FontWeight.w700, letterSpacing: 1.4))),
                ]),
                const SizedBox(height: 24),
                Text(checking ? 'Conferindo pagamento' : 'Deseja sair do pagamento?',
                  style: TextStyle(color: ink, fontSize: 25, height: 1.15,
                    letterSpacing: -0.7, fontWeight: FontWeight.w800)),
                const SizedBox(height: 12),
                Text(checking
                    ? 'Aguarde um instante…'
                    : 'Se ainda não pagou, você pode desistir e liberar o motorista. '
                      'Já fez o Pix? Confira a confirmação antes de sair.',
                  style: TextStyle(color: muted, fontSize: 15, height: 1.5)),
                const SizedBox(height: 22),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: soft,
                    borderRadius: BorderRadius.circular(18)),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (checking)
                        const Padding(padding: EdgeInsets.only(top: 2),
                          child: SizedBox.square(dimension: 20,
                            child: CircularProgressIndicator(strokeWidth: 2,
                              color: yellow)))
                      else
                        Icon(Icons.sync_rounded, size: 22, color: muted),
                      const SizedBox(width: 12),
                      Expanded(child: Text(
                        checking
                            ? 'Estamos verificando o status do seu Pix.'
                            : 'Assim que o pagamento confirmar, sua corrida abre automaticamente.',
                        style: TextStyle(color: ink, fontSize: 13, height: 1.5))),
                    ]),
                ),
                if (!checking) ...[
                  const SizedBox(height: 24),
                  FilledButton(onPressed: onContinue, style: buttonStyle,
                    child: const Text('Continuar no pagamento', textAlign: TextAlign.center)),
                  if (onVerify != null) ...[
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: onVerify,
                      icon: const Icon(Icons.check_circle_outline_rounded, size: 19),
                      label: const Text('Já paguei · verificar', textAlign: TextAlign.center),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: ink,
                        side: BorderSide(color: border),
                        minimumSize: const Size.fromHeight(52),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 15),
                        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  TextButton(onPressed: onLeave,
                    style: TextButton.styleFrom(foregroundColor: muted,
                      minimumSize: const Size.fromHeight(48)),
                    child: const Text('Não paguei · desistir', textAlign: TextAlign.center)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
