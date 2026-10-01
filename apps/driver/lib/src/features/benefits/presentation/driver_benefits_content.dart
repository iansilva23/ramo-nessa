import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../domain/driver_benefits_models.dart';

class DriverBenefitsCampaignContent extends StatelessWidget {
  const DriverBenefitsCampaignContent({super.key, required this.campaigns,
    required this.campaign, required this.history, required this.now, required this.onSelect});

  final List<DriverBenefitCampaign> campaigns;
  final DriverBenefitCampaign campaign;
  final List<DriverBenefitHistory> history;
  final DateTime now;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final me = campaign.me;
    return Align(alignment: Alignment.topCenter, child: SizedBox(width: 760, child: ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
      children: [
        if (campaigns.length > 1) ...[
          _Panel(child: DropdownButtonHideUnderline(child: DropdownButton<String>(
            key: const ValueKey('benefits-campaign-selector'),
            value: campaign.id, isExpanded: true,
            dropdownColor: RamoColors.darkSurface,
            items: campaigns.map((item) => DropdownMenuItem(
              value: item.id, child: Text(item.name, maxLines: 2, overflow: TextOverflow.ellipsis),
            )).toList(),
            onChanged: (id) { if (id != null) onSelect(id); },
          ))),
          const SizedBox(height: 16),
        ],
        _Hero(campaign: campaign, now: now),
        const SizedBox(height: 20),
        _Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const _SectionTitle('Destaques da campanha', Icons.emoji_events_rounded),
          const SizedBox(height: 18),
          _Podium(entries: campaign.leaderboard),
        ])),
        const SizedBox(height: 16),
        _Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const _SectionTitle('Classificação', Icons.leaderboard_rounded),
          const SizedBox(height: 4),
          Text('${campaign.participantCount} participantes · Top 20 + sua posição',
            style: const TextStyle(color: Colors.white70, fontSize: 12)),
          const SizedBox(height: 12),
          for (final entry in campaign.leaderboard) ...[
            _RankingRow(entry: entry),
            const SizedBox(height: 8),
          ],
        ])),
        const SizedBox(height: 16),
        _Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const _SectionTitle('Seus pontos, sem mistério', Icons.insights_rounded),
          const SizedBox(height: 12),
          _PointsRow('Corridas concluídas', me.breakdown.ridePoints),
          _PointsRow('Avaliações 5★', me.breakdown.fiveStarPoints),
          _PointsRow('Avaliações 4★', me.breakdown.fourStarPoints),
          _PointsRow('Qualidade · baixo cancelamento', me.breakdown.lowCancellationBonusPoints),
          _PointsRow('Missões concluídas', me.breakdown.missionPoints),
          const Divider(height: 24),
          _PointsRow('Total', me.points, total: true),
          const SizedBox(height: 8),
          Text('Cancelamentos atribuídos a você: ${(me.cancellationRateBps / 100).toStringAsFixed(1).replaceAll('.', ',')}%.',
            style: const TextStyle(fontSize: 12, color: Colors.white70)),
        ])),
        const SizedBox(height: 16),
        _Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const _SectionTitle('Suas missões', Icons.flag_rounded),
          const SizedBox(height: 16),
          if (me.missions.isEmpty) const Text('Esta campanha não tem missões adicionais.'),
          for (final mission in me.missions) ...[
            _Mission(mission: mission),
            const SizedBox(height: 16),
          ],
        ])),
        const SizedBox(height: 16),
        _Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const _SectionTitle('Prêmios da campanha', Icons.card_giftcard_rounded),
          const SizedBox(height: 12),
          _AwardEligibility(participantCount: campaign.participantCount,
            minParticipants: campaign.minParticipants, unlocked: campaign.prizesUnlocked),
          const SizedBox(height: 14),
          Text('Premiação para o Top ${campaign.topCount}', style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          if (campaign.prizes.isEmpty) const Text('O administrador ainda não descreveu os prêmios.'),
          for (final prize in campaign.prizes) Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${prize.rank}º', style: const TextStyle(color: RamoColors.brandYellow, fontWeight: FontWeight.w900)),
              const SizedBox(width: 12), Expanded(child: Text(prize.label)),
            ]),
          ),
          const Divider(height: 24),
          const Text('Prêmios informativos. A entrega ou eventual pagamento é feito manualmente pelo Ramo Nessa. Não gera saldo na carteira.',
            style: TextStyle(color: Colors.white70, fontSize: 12, height: 1.5)),
        ])),
        const SizedBox(height: 20),
        DriverBenefitsHistoryContent(history: history),
        const SizedBox(height: 18),
        const Text('Seu destaque vem de um bom atendimento. Respeite o trânsito e seus limites.',
          textAlign: TextAlign.center, style: TextStyle(color: Colors.white70, fontSize: 12)),
      ],
    )));
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.campaign, required this.now});
  final DriverBenefitCampaign campaign;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final me = campaign.me;
    final gap = me.gapToNextPoints;
    final progress = me.rank == 1 || gap == 0 ? 1.0 : me.points / (me.points + gap);
    final remaining = campaign.endsAt.difference(now);
    final timeLabel = remaining.inDays > 0 ? '${remaining.inDays} dias restantes'
        : remaining.inHours > 0 ? '${remaining.inHours} h restantes'
        : '${remaining.inMinutes.clamp(0, 60)} min restantes';
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Color(0xFF2A2B1D), RamoColors.darkSurface, RamoColors.brandBlack]),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: RamoColors.brandYellow.withValues(alpha: .35)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 8, runSpacing: 8, children: [
          _Badge(campaign.categoryLabel, bright: true), _Badge(timeLabel),
        ]),
        const SizedBox(height: 20),
        Text(campaign.name, style: const TextStyle(fontSize: 25, height: 1.15,
          fontWeight: FontWeight.w900, letterSpacing: -.6)),
        const SizedBox(height: 22),
        Wrap(spacing: 28, runSpacing: 16, children: [
          _Metric('Sua posição', '#${me.rank}', key: const ValueKey('benefits-my-rank')),
          _Metric('Sua pontuação', '${_number(me.points)} pts', key: const ValueKey('benefits-my-points')),
        ]),
        const SizedBox(height: 20),
        Text(me.rank == 1 ? 'Você está na liderança.'
          : gap == 0 ? 'Pontos empatados com #${me.rank - 1}. Corridas e avaliação definem o desempate.'
          : 'Faltam ${_number(gap)} pontos para #${me.rank - 1}',
          style: const TextStyle(fontWeight: FontWeight.w700, color: RamoColors.brandYellow)),
        const SizedBox(height: 10),
        ClipRRect(borderRadius: BorderRadius.circular(8), child: LinearProgressIndicator(
          value: progress, minHeight: 7, backgroundColor: Colors.white12,
          color: RamoColors.brandYellow, semanticsLabel: 'Progresso para a próxima posição',
        )),
        const SizedBox(height: 18),
        Wrap(spacing: 18, runSpacing: 8, children: [
          Text('${me.completedRides} corridas concluídas', style: const TextStyle(color: Colors.white70)),
          Text('★ ${_rating(me.ratingAverage)}', style: const TextStyle(color: Colors.white70)),
        ]),
      ]),
    );
  }
}

class _Podium extends StatelessWidget {
  const _Podium({required this.entries});
  final List<DriverBenefitRankingEntry> entries;

  DriverBenefitRankingEntry? _at(int rank) {
    for (final entry in entries) { if (entry.rank == rank) return entry; }
    return null;
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, constraints) {
    if (constraints.maxWidth < 300 || MediaQuery.textScalerOf(context).scale(1) > 1.3) {
      return Column(children: [for (final rank in [1, 2, 3]) Padding(
        padding: const EdgeInsets.only(bottom: 8), child: _PodiumPlace(rank: rank, entry: _at(rank)),
      )]);
    }
    return Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
      for (final rank in [2, 1, 3]) Expanded(child: Padding(
        padding: EdgeInsets.only(left: rank == 2 ? 0 : 6, right: rank == 3 ? 0 : 6),
        child: _PodiumPlace(rank: rank, entry: _at(rank)),
      )),
    ]);
  });
}

class _PodiumPlace extends StatelessWidget {
  const _PodiumPlace({required this.rank, required this.entry});
  final int rank;
  final DriverBenefitRankingEntry? entry;

  @override
  Widget build(BuildContext context) {
    final first = rank == 1;
    final foreground = first ? RamoColors.brandBlack : Colors.white;
    return Semantics(label: '$rankº lugar: ${entry?.displayName ?? 'aguardando participante'}', child: Container(
      key: ValueKey('benefits-podium-$rank'), width: double.infinity,
      padding: EdgeInsets.fromLTRB(8, first ? 24 : 14, 8, 14),
      decoration: BoxDecoration(
        color: first ? RamoColors.brandYellow : RamoColors.darkRaised,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: first ? RamoColors.brandYellow : RamoColors.darkBorder),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(first ? Icons.emoji_events_rounded : Icons.workspace_premium_rounded, color: foreground, size: first ? 36 : 28),
        const SizedBox(height: 6),
        Text('$rankº', style: TextStyle(color: foreground, fontWeight: FontWeight.w900, fontSize: 23)),
        const SizedBox(height: 6),
        Text(entry == null ? 'Aguardando' : entry!.isMe ? 'Você' : entry!.displayName,
          textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis,
          style: TextStyle(color: foreground, fontWeight: FontWeight.w800, fontSize: 12)),
        if (entry != null) ...[
          const SizedBox(height: 6),
          Text('${_number(entry!.points)} pts', textAlign: TextAlign.center,
            style: TextStyle(color: foreground, fontWeight: FontWeight.w700, fontSize: 11)),
        ],
      ]),
    ));
  }
}

class _RankingRow extends StatelessWidget {
  const _RankingRow({required this.entry});
  final DriverBenefitRankingEntry entry;

  @override
  Widget build(BuildContext context) {
    final me = entry.isMe;
    return Container(
      key: ValueKey('benefits-rank-${entry.rank}'), padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: me ? RamoColors.brandYellow.withValues(alpha: .12) : Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: me ? RamoColors.brandYellow.withValues(alpha: .5) : Colors.transparent),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        SizedBox(width: 30, child: Text('#${entry.rank}', style: TextStyle(
          fontWeight: FontWeight.w900, color: me ? RamoColors.brandYellow : Colors.white70))),
        const SizedBox(width: 8),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(me ? 'Você · ${entry.displayName}' : entry.displayName, style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 3),
          Text('${entry.completedRides} corridas · ★ ${_rating(entry.ratingAverage)}',
            style: const TextStyle(fontSize: 11, color: Colors.white70)),
        ])),
        const SizedBox(width: 8),
        Flexible(child: Text('${_number(entry.points)} pts', textAlign: TextAlign.right,
          style: TextStyle(fontWeight: FontWeight.w900, color: me ? RamoColors.brandYellow : Colors.white))),
      ]),
    );
  }
}

class _Mission extends StatelessWidget {
  const _Mission({required this.mission});
  final DriverBenefitMissionProgress mission;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Icon(mission.completed ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
        color: RamoColors.brandYellow, size: 20),
      const SizedBox(width: 10),
      Expanded(child: Text(mission.title, style: const TextStyle(fontWeight: FontWeight.w800))),
    ]),
    const SizedBox(height: 8),
    Text('${mission.current} / ${mission.target} · +${_number(mission.bonusPoints)} pts${mission.completed ? ' · Concluída' : ''}',
      style: const TextStyle(fontSize: 12, color: Colors.white70)),
    const SizedBox(height: 8),
    ClipRRect(borderRadius: BorderRadius.circular(6), child: LinearProgressIndicator(
      value: mission.progress, color: RamoColors.brandYellow, backgroundColor: Colors.white12, minHeight: 6,
      semanticsLabel: mission.title, semanticsValue: '${mission.current} de ${mission.target}',
    )),
  ]);
}

class DriverBenefitsHistoryContent extends StatelessWidget {
  const DriverBenefitsHistoryContent({super.key, required this.history});
  final List<DriverBenefitHistory> history;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return _Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const _SectionTitle('Hall da Fama', Icons.history_rounded),
      const SizedBox(height: 8),
      if (history.isEmpty) Text('As campanhas encerradas em que você participou aparecerão aqui.',
        style: TextStyle(color: dark ? Colors.white70 : RamoColors.muted)),
      for (final item in history) ExpansionTile(
        key: ValueKey('benefits-history-${item.id}'), tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(bottom: 12),
        title: Text(item.name, style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text('${driverBenefitCategoryLabel(item.category)} · ${_date(item.endsAt)}'),
        children: [
          Align(alignment: Alignment.centerLeft, child: Text('Sua posição #${item.myRank} · ${_number(item.myPoints)} pts',
            style: const TextStyle(fontWeight: FontWeight.w800))),
          const SizedBox(height: 12),
          _AwardEligibility(participantCount: item.participantCount, minParticipants: item.minParticipants, unlocked: item.prizesUnlocked),
          const SizedBox(height: 12),
          if (item.prizesUnlocked) ...[
            Align(alignment: Alignment.centerLeft, child: Text('Destaques · Top ${item.topCount}', style: const TextStyle(fontWeight: FontWeight.w800))),
            for (final winner in item.winners) Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Align(alignment: Alignment.centerLeft, child: Text('${winner.rank}º · ${winner.isMe ? 'Você' : winner.displayName} · ${_number(winner.points)} pts')),
            ),
          ],
          for (final prize in item.prizes) Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Align(alignment: Alignment.centerLeft, child: Text('${prize.rank}º · ${prize.label}')),
          ),
          const SizedBox(height: 8),
          const Text('Prêmios definidos e entregues manualmente pelo Ramo Nessa.', style: TextStyle(fontSize: 12)),
        ],
      ),
    ]));
  }
}

class _AwardEligibility extends StatelessWidget {
  const _AwardEligibility({required this.participantCount, required this.minParticipants, required this.unlocked});
  final int participantCount;
  final int minParticipants;
  final bool unlocked;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity, padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: RamoColors.brandYellow.withValues(alpha: .12), borderRadius: BorderRadius.circular(14)),
    child: Text(unlocked ? 'Mínimo de participantes atingido · $participantCount participantes'
      : 'Premiação ainda não liberada · $participantCount de $minParticipants participantes',
      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
  );
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(width: double.infinity, padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: dark ? RamoColors.darkSurface : Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(24), border: Border.all(color: dark ? RamoColors.darkBorder : RamoColors.border)),
      child: child);
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title, this.icon);
  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Row(children: [
    Icon(icon, color: RamoColors.brandGold, size: 22), const SizedBox(width: 10),
    Expanded(child: Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, letterSpacing: -.3))),
  ]);
}

class _PointsRow extends StatelessWidget {
  const _PointsRow(this.label, this.points, {this.total = false});
  final String label;
  final int points;
  final bool total;

  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(child: Text(label, style: TextStyle(fontWeight: total ? FontWeight.w900 : FontWeight.w500))),
      const SizedBox(width: 12),
      Flexible(child: Text('${total ? '' : '+'}${_number(points)} pts', textAlign: TextAlign.right,
        style: TextStyle(color: RamoColors.brandYellow, fontWeight: total ? FontWeight.w900 : FontWeight.w700))),
    ]));
}

class _Metric extends StatelessWidget {
  const _Metric(this.label, this.value, {super.key});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
    const SizedBox(height: 4),
    Text(value, style: const TextStyle(color: RamoColors.brandYellow, fontWeight: FontWeight.w900, fontSize: 32, letterSpacing: -.8)),
  ]);
}

class _Badge extends StatelessWidget {
  const _Badge(this.label, {this.bright = false});
  final String label;
  final bool bright;

  @override
  Widget build(BuildContext context) => Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
    decoration: BoxDecoration(color: bright ? RamoColors.brandYellow : Colors.white10, borderRadius: BorderRadius.circular(10)),
    child: Text(label, style: TextStyle(color: bright ? RamoColors.brandBlack : Colors.white70, fontSize: 11, fontWeight: FontWeight.w800)));
}

String _number(int value) => value.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.');
String _rating(double value) => value == 0 ? 'sem avaliação' : value.toStringAsFixed(1).replaceAll('.', ',');
String _date(DateTime value) {
  final local = value.toLocal();
  return '${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')}/${local.year}';
}
