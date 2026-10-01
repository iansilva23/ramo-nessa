import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

class DriverRankingBenefitsScreen extends StatelessWidget {
  const DriverRankingBenefitsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Ranking & Benefícios'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          RamoSpacing.lg,
          RamoSpacing.md,
          RamoSpacing.lg,
          RamoSpacing.xxl,
        ),
        children: [
          Container(
            padding: const EdgeInsets.all(RamoSpacing.xl),
            decoration: BoxDecoration(
              color: RamoColors.brandBlack,
              borderRadius: BorderRadius.circular(28),
              boxShadow: RamoElevation.floating(context),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: RamoColors.brandYellow,
                    borderRadius: BorderRadius.circular(RamoRadius.pill),
                  ),
                  child: const Text(
                    'EM BREVE',
                    style: TextStyle(
                      color: RamoColors.brandBlack,
                      fontWeight: FontWeight.w900,
                      fontSize: 11,
                      letterSpacing: .8,
                    ),
                  ),
                ),
                const SizedBox(height: RamoSpacing.lg),
                const Icon(
                  Icons.emoji_events_rounded,
                  color: RamoColors.brandYellow,
                  size: 48,
                ),
                const SizedBox(height: RamoSpacing.md),
                const Text(
                  'Seu destaque vai valer ainda mais.',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 25,
                    height: 1.08,
                    letterSpacing: -.5,
                  ),
                ),
                const SizedBox(height: RamoSpacing.sm),
                Text(
                  'Estamos preparando uma nova experiência para reconhecer '
                  'os motoristas que mais se destacam no Ramo Nessa.',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: .78),
                    fontWeight: FontWeight.w600,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: RamoSpacing.xl),
          Text(
            'O que vem por aí',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                  letterSpacing: -.3,
                ),
          ),
          const SizedBox(height: RamoSpacing.sm),
          const _ComingSoonBenefit(
            icon: Icons.leaderboard_rounded,
            title: 'Rankings do seu jeito de trabalhar',
            description:
                'Acompanhe sua posição em campanhas da sua categoria e região.',
          ),
          const SizedBox(height: RamoSpacing.sm),
          const _ComingSoonBenefit(
            icon: Icons.workspace_premium_rounded,
            title: 'Reconhecimento por desempenho',
            description:
                'Corridas, avaliações, qualidade e conquistas poderão destacar '
                'quem faz um trabalho excelente.',
          ),
          const SizedBox(height: RamoSpacing.sm),
          const _ComingSoonBenefit(
            icon: Icons.card_giftcard_rounded,
            title: 'Prêmios e benefícios especiais',
            description:
                'Campanhas poderão trazer premiações, kits e outros benefícios '
                'definidos pelo Ramo Nessa.',
          ),
          const SizedBox(height: RamoSpacing.xl),
          Container(
            padding: const EdgeInsets.all(RamoSpacing.lg),
            decoration: BoxDecoration(
              color: colors.surfaceContainerHighest.withValues(alpha: .55),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(
                color: colors.outlineVariant.withValues(alpha: .55),
              ),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.notifications_active_outlined,
                  color: RamoColors.brandYellow,
                ),
                SizedBox(width: RamoSpacing.md),
                Expanded(
                  child: Text(
                    'Quando uma campanha estiver disponível para sua categoria '
                    'e região, ela aparecerá aqui no app.',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: RamoSpacing.lg),
          const Center(
            child: Text(
              'Continue fazendo um ótimo trabalho. Novidades estão chegando.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: RamoColors.muted,
                fontWeight: FontWeight.w700,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ComingSoonBenefit extends StatelessWidget {
  const _ComingSoonBenefit({
    required this.icon,
    required this.title,
    required this.description,
  });

  final IconData icon;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.lg),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: Theme.of(context)
              .colorScheme
              .outlineVariant
              .withValues(alpha: .45),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: RamoColors.brandYellow,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(
              icon,
              color: RamoColors.brandBlack,
              size: 23,
            ),
          ),
          const SizedBox(width: RamoSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  description,
                  style: const TextStyle(
                    color: RamoColors.muted,
                    fontWeight: FontWeight.w600,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
