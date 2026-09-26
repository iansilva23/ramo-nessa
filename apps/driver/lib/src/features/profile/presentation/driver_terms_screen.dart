import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

class DriverTermsScreen extends StatelessWidget {
  const DriverTermsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Termos e privacidade')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          RamoSpacing.lg,
          RamoSpacing.lg,
          RamoSpacing.lg,
          RamoSpacing.xxl,
        ),
        children: const [
          _LegalNotice(),
          SizedBox(height: RamoSpacing.xl),
          _LegalSection(
            title: 'Uso do aplicativo',
            body:
                'O aplicativo do motorista é destinado a motoristas aprovados '
                'na plataforma Ramo Nessa. O acesso é pessoal e não deve ser '
                'compartilhado com terceiros.',
          ),
          _LegalSection(
            title: 'Localização',
            body:
                'Quando o motorista fica online, a localização pode ser usada '
                'para encontrar corridas próximas, calcular rotas e acompanhar '
                'uma corrida em andamento. O motorista pode retirar a permissão '
                'pelas configurações do aparelho.',
          ),
          _LegalSection(
            title: 'Pagamentos e carteira',
            body:
                'Ganhos, taxas aplicáveis, saldos, saques e movimentações são '
                'registrados pelo Core e aparecem na Carteira e no Extrato do '
                'motorista.',
          ),
          _LegalSection(
            title: 'Documentos e perfil',
            body:
                'Dados cadastrais, foto de perfil, CNH e CRLV podem ser '
                'tratados para cadastro, segurança, revisão documental e '
                'operação da plataforma.',
          ),
          _LegalSection(
            title: 'Segurança da conta',
            body:
                'Sessões podem ser revogadas, inclusive em outros aparelhos. '
                'O motorista deve manter o próprio telefone e credenciais sob '
                'controle e comunicar acessos que não reconheça.',
          ),
          _LegalSection(
            title: 'Versão deste texto',
            body:
                'Rascunho operacional interno — 24/09/2026. O texto jurídico '
                'definitivo deve ser revisado e aprovado antes da publicação '
                'comercial.',
          ),
        ],
      ),
    );
  }
}

class _LegalNotice extends StatelessWidget {
  const _LegalNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.lg),
      decoration: BoxDecoration(
        color: RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(RamoRadius.lg),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.gavel_rounded),
          SizedBox(width: RamoSpacing.md),
          Expanded(
            child: Text(
              'Esta tela já organiza as informações legais do aplicativo, mas '
              'o conteúdo ainda é um rascunho operacional e não substitui a '
              'revisão jurídica necessária antes do lançamento comercial.',
            ),
          ),
        ],
      ),
    );
  }
}

class _LegalSection extends StatelessWidget {
  const _LegalSection({
    required this.title,
    required this.body,
  });

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: RamoSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 17,
            ),
          ),
          const SizedBox(height: RamoSpacing.sm),
          Text(
            body,
            style: const TextStyle(height: 1.45),
          ),
        ],
      ),
    );
  }
}
