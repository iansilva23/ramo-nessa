import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../data/passenger_support_service.dart';
import 'passenger_support_screen.dart';

class PassengerHelpScreen extends StatelessWidget {
  const PassengerHelpScreen({
    super.key,
    this.supportService,
    this.previewMode = false,
  });

  final PassengerSupportService? supportService;
  final bool previewMode;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ajuda')),
      body: SafeArea(child: Center(child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: RamoReveal(child: ListView(
        padding: const EdgeInsets.fromLTRB(
          RamoSpacing.lg,
          RamoSpacing.lg,
          RamoSpacing.lg,
          RamoSpacing.xxl,
        ),
        children: [
          const _HelpHeader(),
          if (supportService != null) ...[
            const SizedBox(height: RamoSpacing.lg),
            FilledButton.icon(
              style: FilledButton.styleFrom(padding: const EdgeInsets.all(16)),
              key: const Key('passenger-open-support'),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => PassengerSupportScreen(
                    service: supportService!,
                    previewMode: previewMode,
                  ),
                ),
              ),
              icon: const Icon(Icons.support_agent_rounded),
              label: const Text('Falar com o suporte'),
            ),
          ],
          const SizedBox(height: RamoSpacing.xl),
          const _HelpItem(
            title: 'Como pedir uma corrida?',
            body:
                'Na tela Início, confirme a origem, escolha o destino, selecione '
                'a categoria e siga a confirmação e o pagamento mostrados no aplicativo.',
          ),
          const _HelpItem(
            title: 'Como acompanho o motorista?',
            body:
                'Depois que um motorista aceitar, a tela da corrida mostra o '
                'a etapa atual, a localização disponível e as informações do motorista.',
          ),
          const _HelpItem(
            title: 'Onde vejo minhas corridas?',
            body:
                'Use Atividade no menu inferior ou Histórico de corridas dentro do Perfil.',
          ),
          const _HelpItem(
            title: 'E se nenhum motorista aceitar?',
            body:
                'Você pode tentar a busca novamente ou cancelar. Se houver pagamento, '
                'acompanhe a devolução pelo aplicativo ou fale com o suporte.',
          ),
          const _HelpItem(
            title: 'Como protejo minha conta?',
            body:
                'Em Perfil > Segurança você pode conferir a validade da sessão '
                'e encerrar acessos em outros aparelhos.',
          ),
          const _HelpItem(
            title: 'Problemas com notificações ou GPS?',
            body:
                'Abra Perfil > Configurações para acessar as permissões do '
                'aplicativo e os serviços de localização do aparelho.',
          ),
        ],
      ),
        )))),
    );
  }
}

class _HelpHeader extends StatelessWidget {
  const _HelpHeader();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(RamoRadius.lg),
          ),
          child: Icon(Icons.support_agent_rounded,
              color: Theme.of(context).colorScheme.onPrimaryContainer, size: 30),
        ),
        const SizedBox(height: RamoSpacing.lg),
        Semantics(header: true, child: Text('Conte com a gente',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900))),
        const SizedBox(height: RamoSpacing.sm),
        Text('Encontre respostas ou converse com nossa equipe pelo suporte.',
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ],
    );
  }
}

class _HelpItem extends StatelessWidget {
  const _HelpItem({
    required this.title,
    required this.body,
  });

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: RamoSpacing.sm),
      child: ExpansionTile(
      tilePadding: const EdgeInsets.symmetric(horizontal: 16),
      title: Text(
        title,
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: Text(
            body,
            style: TextStyle(height: 1.45, color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
        ),
      ],
      ),
    );
  }
}

