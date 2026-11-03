import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../pricing/data/shared_transfer_option.dart';

class SharedTransferButton extends StatefulWidget {
  const SharedTransferButton({super.key, required this.option, this.enabled = true, this.beforeOpen});
  final SharedTransferOption option;
  final bool enabled;
  final Future<bool> Function()? beforeOpen;
  @override
  State<SharedTransferButton> createState() => _SharedTransferButtonState();
}

class _SharedTransferButtonState extends State<SharedTransferButton> {
  bool _opening = false;
  Future<void> _open() async {
    if (_opening || !widget.enabled) return;
    setState(() => _opening = true);
    try {
      final accepted = await showDialog<bool>(context: context, builder: (dialogContext) => AlertDialog(
        title: const Text('Consultar compartilhado'),
        content: const Text('Você será atendido pela agência parceira no WhatsApp. Preço, horário, reserva e pagamento serão combinados diretamente com ela.'),
        actions: [TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Voltar')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Abrir WhatsApp'))],
      ));
      if (accepted != true || !mounted) return;
      final url = widget.option.url;
      if (widget.beforeOpen != null && !await widget.beforeOpen!()) return;
      final launched = await launchUrl(url, mode: LaunchMode.externalApplication);
      if (!launched && mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Não conseguimos abrir o WhatsApp. Tente novamente.')));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Não conseguimos abrir essa opção agora. Tente novamente.')));
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }
  @override
  Widget build(BuildContext context) => TextButton.icon(
    key: const Key('shared-transfer-whatsapp-button'),
    onPressed: widget.enabled && !_opening ? _open : null,
    icon: const Icon(Icons.chat_bubble_outline_rounded, size: 16),
    label: Text(widget.option.label, style: Theme.of(context).textTheme.bodySmall),
  );
}
