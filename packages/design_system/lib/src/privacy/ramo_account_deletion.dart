import 'package:flutter/material.dart';

class RamoDeletionOverview {
  const RamoDeletionOverview({required this.available, required this.eligible, this.reason});
  final bool available;
  final bool eligible;
  final String? reason;
}
class RamoDeletionResult {
  const RamoDeletionResult({required this.id, required this.deleted});
  final String id;
  final bool deleted;
}
abstract interface class RamoAccountDeletionService {
  Future<RamoDeletionOverview> deletionOverview();
  Future<RamoDeletionResult> deleteOwnAccount();
}

class RamoAccountDeletionSection extends StatefulWidget {
  const RamoAccountDeletionSection({super.key, required this.service, this.onClosed});
  final RamoAccountDeletionService service;
  final Future<void> Function()? onClosed;
  @override
  State<RamoAccountDeletionSection> createState() => _RamoAccountDeletionSectionState();
}
class _RamoAccountDeletionSectionState extends State<RamoAccountDeletionSection> {
  RamoDeletionOverview? _overview;
  String? _error;
  bool _busy = false;
  @override
  void initState() {super.initState();_load();}
  Future<void> _load() async {
    try {
      final value = await widget.service.deletionOverview();
      if (mounted) setState(() {_overview = value;_error = null;});
    } catch (_) {
      if (mounted) setState(() => _error = 'Não conseguimos consultar a exclusão agora.');
    }
  }
  Future<void> _delete() async {
    if (_busy) return;
    setState(() {_busy = true;_error = null;});
    try {
      final current = await widget.service.deletionOverview();
      if (!mounted) return;
      setState(() => _overview = current);
      if (!current.available || !current.eligible) return;
      final confirmed = await showDialog<bool>(context:context,builder:(context) => AlertDialog(
        title: const Text('Excluir minha conta?'),
        content: const SingleChildScrollView(child: Text('A exclusão é definitiva. Seu acesso, perfil, fotos, locais salvos e documentos privados serão removidos. Registros necessários de corridas, pagamentos e atendimento serão preservados. Nenhum saldo será renunciado.')),
        actions: [TextButton(onPressed:()=>Navigator.pop(context,false),child:const Text('Cancelar')),FilledButton(onPressed:()=>Navigator.pop(context,true),child:const Text('Excluir definitivamente'))],
      ));
      if (confirmed != true || !mounted) return;
      final result = await widget.service.deleteOwnAccount();
      if (!mounted) return;
      await showDialog<void>(context:context,barrierDismissible:false,builder:(context) => AlertDialog(
        title: Text(result.deleted ? 'Conta excluída' : 'Exclusão em processamento'),
        content: SingleChildScrollView(child: Text(result.deleted ? 'A exclusão foi concluída. Seu acesso foi encerrado.' : 'Seu acesso foi encerrado e a limpeza continuará automaticamente. Protocolo: ${result.id}')),
        actions:[TextButton(onPressed:()=>Navigator.pop(context),child:const Text('Entendi'))],
      ));
      if (mounted) await widget.onClosed?.call();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
  @override
  Widget build(BuildContext context) {
    if (_overview?.available != true && _error == null) return const SizedBox.shrink();
    return Padding(padding:const EdgeInsets.symmetric(vertical:16),child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      Text('Excluir conta',style:Theme.of(context).textTheme.titleLarge),
      const SizedBox(height:8),
      Text(_overview?.reason ?? 'Exclua sua conta e os dados dispensáveis de forma definitiva.'),
      if (_error != null) ...[const SizedBox(height:8),Text(_error!,style:TextStyle(color:Theme.of(context).colorScheme.error)),TextButton(onPressed:_busy?null:_load,child:const Text('Tentar novamente'))],
      if (_overview?.available == true) OutlinedButton.icon(onPressed:_busy?null:_delete,icon:const Icon(Icons.delete_forever_outlined),label:Text(_busy?'Aguarde…':'Excluir minha conta')),
    ]));
  }
}
