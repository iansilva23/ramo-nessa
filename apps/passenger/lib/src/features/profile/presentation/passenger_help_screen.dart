import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

class PassengerHelpScreen extends StatelessWidget {
  const PassengerHelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ajuda')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          RamoSpacing.lg,
          RamoSpacing.lg,
          RamoSpacing.lg,
          RamoSpacing.xxl,
        ),
        children: const [
          _HelpHeader(),
          SizedBox(height: RamoSpacing.xl),
          _HelpItem(
            title: 'Como pedir uma corrida?',
            body:
                'Na tela Início, confirme a origem, escolha o destino, selecione '
                'a categoria e a forma de pagamento. A busca pelo motorista só '
                'começa depois das validações e do pagamento exigido pela operação.',
          ),
          _HelpItem(
            title: 'Como acompanho o motorista?',
            body:
                'Depois que um motorista aceitar, a tela da corrida mostra o '
                'status e a posição disponível em tempo real ou próximo do tempo real.',
          ),
          _HelpItem(
            title: 'Onde vejo minhas corridas?',
            body:
                'Use Atividade no menu inferior ou Histórico de corridas dentro do Perfil.',
          ),
          _HelpItem(
            title: 'E se nenhum motorista aceitar?',
            body:
                'O aplicativo informa que não encontrou motorista. Quando houver '
                'pagamento antecipado, o fluxo de estorno segue as regras do Core.',
          ),
          _HelpItem(
            title: 'Como protejo minha conta?',
            body:
                'Em Perfil > Segurança você pode conferir a validade da sessão '
                'e encerrar acessos em outros aparelhos.',
          ),
          _HelpItem(
            title: 'Problemas com notificações ou GPS?',
            body:
                'Abra Perfil > Configurações para acessar as permissões do '
                'aplicativo e os serviços de localização do aparelho.',
          ),
        ],
      ),
    );
  }
}

class _HelpHeader extends StatelessWidget {
  const _HelpHeader();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.lg),
      decoration: BoxDecoration(
        color: RamoColors.brandBlack,
        borderRadius: BorderRadius.circular(RamoRadius.lg),
      ),
      child: const Row(
        children: [
          Icon(
            Icons.support_agent_rounded,
            color: RamoColors.brandYellow,
            size: 34,
          ),
          SizedBox(width: RamoSpacing.md),
          Expanded(
            child: Text(
              'Encontre rapidamente as orientações mais importantes para usar o Ramo Nessa.',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
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
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      title: Text(
        title,
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
      childrenPadding: const EdgeInsets.only(bottom: RamoSpacing.md),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: Text(
            body,
            style: const TextStyle(height: 1.45, color: RamoColors.muted),
          ),
        ),
      ],
    );
  }
}
