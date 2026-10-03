import 'dart:async';

import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../benefits/data/driver_benefits_api.dart';
import '../../benefits/domain/driver_benefits_models.dart';
import '../../benefits/presentation/driver_benefits_content.dart';
import '../../home/data/driver_api.dart';

class DriverRankingBenefitsScreen extends StatefulWidget {
  const DriverRankingBenefitsScreen({super.key, this.api, this.clock});

  final DriverBenefitsApi? api;
  final DateTime Function()? clock;

  @override
  State<DriverRankingBenefitsScreen> createState() => _DriverRankingBenefitsScreenState();
}

class _DriverRankingBenefitsScreenState extends State<DriverRankingBenefitsScreen>
    with WidgetsBindingObserver {
  DriverBenefitsSnapshot? _snapshot;
  String? _selectedId;
  String? _error;
  bool _loading = false;
  bool _darkExperience = false;
  int _requestId = 0;
  Timer? _refreshTimer;

  DateTime get _now => widget.clock?.call() ?? DateTime.now();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.api != null) {
      _load();
      _startRefresh();
    }
  }

  void _startRefresh() {
    _refreshTimer?.cancel();
    if (widget.api == null) return;
    _refreshTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (!_loading) _load();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _refreshTimer?.cancel();
    if (state == AppLifecycleState.resumed && widget.api != null) {
      _load();
      _startRefresh();
    }
  }

  @override
  void didUpdateWidget(DriverRankingBenefitsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.api != widget.api) {
      _load();
      _startRefresh();
    }
  }

  @override
  void dispose() {
    _requestId++;
    _refreshTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _load() async {
    final requestId = ++_requestId;
    setState(() {
      _loading = widget.api != null;
      _error = null;
      _snapshot = null;
      if (widget.api == null) {
        _darkExperience = false;
        _selectedId = null;
      }
    });
    if (widget.api == null) return;
    try {
      final snapshot = await widget.api!.benefits();
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _snapshot = snapshot;
        _loading = false;
        _darkExperience = snapshot.enabled && snapshot.campaigns.any((campaign) =>
          !_now.isBefore(campaign.startsAt) && _now.isBefore(campaign.endsAt));
        if (!snapshot.campaigns.any((campaign) => campaign.id == _selectedId)) {
          _selectedId = snapshot.campaigns.isEmpty ? null : snapshot.campaigns.first.id;
        }
      });
    } on DriverApiException catch (error) {
      _loadFailed(requestId, error.statusCode == 401
          ? 'Sua sessão expirou. Entre novamente para ver suas campanhas.' : error.message);
    } catch (_) {
      _loadFailed(requestId, 'Não conseguimos carregar o ranking agora. Confira sua conexão e tente novamente.');
    }
  }

  void _loadFailed(int requestId, String message) {
    if (!mounted || requestId != _requestId) return;
    setState(() { _loading = false; _error = message; });
  }

  @override
  Widget build(BuildContext context) {
    final campaigns = _snapshot?.enabled == true
        ? _snapshot!.campaigns.where((campaign) => !_now.isBefore(campaign.startsAt) && _now.isBefore(campaign.endsAt)).toList()
        : const <DriverBenefitCampaign>[];
    if (campaigns.isEmpty && !_darkExperience) return _scaffold(context, campaigns);
    return Theme(data: RamoTheme.dark, child: Builder(builder: (context) => _scaffold(context, campaigns)));
  }

  Widget _scaffold(BuildContext context, List<DriverBenefitCampaign> campaigns) {
    final history = _snapshot?.enabled == true ? _snapshot!.history : const <DriverBenefitHistory>[];
    final selected = campaigns.isEmpty ? null : campaigns.firstWhere(
      (campaign) => campaign.id == _selectedId, orElse: () => campaigns.first,
    );
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ranking & Benefícios'),
        actions: [
          if (widget.api != null) IconButton(
            tooltip: 'Atualizar ranking', onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(semanticsLabel: 'Carregando ranking'))
          : _error != null
              ? Center(child: Padding(
                  padding: const EdgeInsets.all(RamoSpacing.xl),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.cloud_off_rounded, size: 44),
                    const SizedBox(height: RamoSpacing.md),
                    Text(_error!, textAlign: TextAlign.center),
                    const SizedBox(height: RamoSpacing.lg),
                    OutlinedButton.icon(onPressed: _load, icon: const Icon(Icons.refresh), label: const Text('Tentar novamente')),
                  ]),
                ))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: selected == null ? _ComingSoonView(history: history) : DriverBenefitsCampaignContent(
                    campaigns: campaigns, campaign: selected, history: history, now: _now,
                    onSelect: (id) => setState(() => _selectedId = id),
                  ),
                ),
    );
  }
}

class _ComingSoonView extends StatelessWidget {
  const _ComingSoonView({this.history = const []});

  final List<DriverBenefitHistory> history;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
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
          Center(
            child: Text(
              'Continue fazendo um ótimo trabalho. Novidades estão chegando.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w700,
                height: 1.4,
              ),
            ),
          ),
          if (history.isNotEmpty) ...[
            const SizedBox(height: RamoSpacing.xl),
            const Text('Nenhuma campanha ativa disponível agora.'),
            const SizedBox(height: RamoSpacing.md),
            DriverBenefitsHistoryContent(history: history),
          ],
        ],
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
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
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
