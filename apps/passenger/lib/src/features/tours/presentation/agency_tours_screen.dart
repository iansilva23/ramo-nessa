import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/agency_tour_service.dart';

class AgencyToursScreen extends StatefulWidget {
  const AgencyToursScreen({
    super.key,
    required this.service,
  });

  final AgencyTourService service;

  @override
  State<AgencyToursScreen> createState() => _AgencyToursScreenState();
}

class _AgencyToursScreenState extends State<AgencyToursScreen> {
  List<AgencyTour> _tours = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final tours = await widget.service.listTours();
      if (!mounted) return;
      setState(() {
        _tours = tours;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error =
            'Não conseguimos carregar os passeios agora. Tente novamente.';
      });
    }
  }

  Future<void> _reserve(AgencyTour tour) async {
    final uri = tour.reservationUri;
    if (uri == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'O WhatsApp deste passeio ainda não foi configurado.',
          ),
        ),
      );
      return;
    }

    final opened = await launchUrl(
      uri,
      mode: LaunchMode.externalApplication,
    );
    if (!mounted || opened) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Não foi possível abrir o WhatsApp agora.'),
      ),
    );
  }

  void _openDetails(AgencyTour tour) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => AgencyTourDetailScreen(
          tour: tour,
          onReserve: () => _reserve(tour),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            RamoSpacing.lg,
            RamoSpacing.lg,
            RamoSpacing.lg,
            RamoSpacing.xxl,
          ),
          children: [
            Text(
              'Passeios',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                    letterSpacing: -1,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              'Experiências selecionadas pela Ramo Nessa Agência.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: RamoColors.muted,
                  ),
            ),
            const SizedBox(height: RamoSpacing.lg),
            if (_loading && _tours.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 80),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && _tours.isEmpty)
              _ToursMessage(
                icon: Icons.wifi_off_rounded,
                title: 'Passeios indisponíveis',
                message: _error!,
                actionLabel: 'Tentar novamente',
                onAction: _load,
              )
            else if (_tours.isEmpty)
              const _ToursMessage(
                icon: Icons.explore_outlined,
                title: 'Novos passeios em breve',
                message:
                    'A agência ainda não publicou passeios para reserva no aplicativo.',
              )
            else
              ..._tours.map(
                (tour) => Padding(
                  padding: const EdgeInsets.only(bottom: RamoSpacing.lg),
                  child: _TourCard(
                    tour: tour,
                    onDetails: () => _openDetails(tour),
                    onReserve: () => _reserve(tour),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _TourCard extends StatelessWidget {
  const _TourCard({
    required this.tour,
    required this.onDetails,
    required this.onReserve,
  });

  final AgencyTour tour;
  final VoidCallback onDetails;
  final VoidCallback onReserve;

  String _money(int cents) {
    final value = (cents / 100).toStringAsFixed(2).replaceAll('.', ',');
    return 'R\$ $value';
  }

  @override
  Widget build(BuildContext context) {
    final highlights = tour.highlights.take(4).toList(growable: false);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(26),
        border: Border.all(
          color: Theme.of(context)
              .colorScheme
              .outlineVariant
              .withValues(alpha: .55),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: .08),
            blurRadius: 22,
            offset: const Offset(0, 9),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(26),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                _TourCover(
                  imageUrl: tour.coverImageUrl,
                  height: 220,
                ),
                Positioned(
                  top: 16,
                  left: 16,
                  child: _TourBadge(label: tour.badge),
                ),
                Positioned.fill(
                  child: Center(
                    child: FilledButton.tonalIcon(
                      onPressed: onDetails,
                      icon: const Icon(Icons.visibility_outlined),
                      label: const Text('Ver detalhes'),
                      style: FilledButton.styleFrom(
                        backgroundColor:
                            Colors.white.withValues(alpha: .94),
                        foregroundColor: RamoColors.brandBlack,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(RamoSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tour.title,
                    style:
                        Theme.of(context).textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w900,
                              letterSpacing: -.55,
                            ),
                  ),
                  const SizedBox(height: RamoSpacing.sm),
                  if (highlights.isNotEmpty)
                    ...highlights.map(
                      (item) => Padding(
                        padding: const EdgeInsets.only(bottom: 7),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.check_rounded,
                              size: 18,
                              color: RamoColors.success,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                item,
                                style: const TextStyle(
                                  color: RamoColors.muted,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  else
                    Text(
                      tour.shortDescription,
                      style: const TextStyle(
                        color: RamoColors.muted,
                        height: 1.45,
                      ),
                    ),
                  const SizedBox(height: RamoSpacing.md),
                  Divider(
                    color: Theme.of(context)
                        .dividerColor
                        .withValues(alpha: .45),
                  ),
                  const SizedBox(height: RamoSpacing.sm),
                  Text(
                    tour.priceLabel,
                    style: const TextStyle(
                      color: RamoColors.muted,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.end,
                    spacing: 6,
                    children: [
                      Text(
                        tour.priceCents == null
                            ? 'Consulte'
                            : _money(tour.priceCents!),
                        style: const TextStyle(
                          color: RamoColors.brandBlack,
                          fontWeight: FontWeight.w900,
                          fontSize: 25,
                        ),
                      ),
                      if (tour.priceSuffix != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 3),
                          child: Text(
                            tour.priceSuffix!,
                            style: const TextStyle(
                              color: RamoColors.muted,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: RamoSpacing.md),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: onDetails,
                          icon: const Icon(Icons.visibility_outlined),
                          label: const Text('Detalhes'),
                        ),
                      ),
                      const SizedBox(width: RamoSpacing.sm),
                      Expanded(
                        flex: 2,
                        child: FilledButton.icon(
                          onPressed: onReserve,
                          icon: const Icon(Icons.chat_rounded),
                          label: const Text('Reservar passeio'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AgencyTourDetailScreen extends StatelessWidget {
  const AgencyTourDetailScreen({
    super.key,
    required this.tour,
    required this.onReserve,
  });

  final AgencyTour tour;
  final VoidCallback onReserve;

  String _money(int cents) {
    final value = (cents / 100).toStringAsFixed(2).replaceAll('.', ',');
    return 'R\$ $value';
  }

  Widget _listSection(
    BuildContext context, {
    required String title,
    required List<String> items,
    required IconData icon,
  }) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: RamoSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
          ),
          const SizedBox(height: RamoSpacing.sm),
          ...items.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    icon,
                    size: 19,
                    color: RamoColors.brandBlack,
                  ),
                  const SizedBox(width: 9),
                  Expanded(child: Text(item)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _info(
    BuildContext context,
    IconData icon,
    String label,
    String? value,
  ) {
    if (value == null || value.trim().isEmpty) {
      return const SizedBox.shrink();
    }
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.md),
      decoration: BoxDecoration(
        color: RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(RamoRadius.md),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22),
          const SizedBox(width: RamoSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: RamoColors.muted,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  value,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      bottomNavigationBar: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: FilledButton.icon(
          onPressed: onReserve,
          icon: const Icon(Icons.chat_rounded),
          label: const Text('Reservar pelo WhatsApp'),
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(56),
          ),
        ),
      ),
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 300,
            pinned: true,
            stretch: true,
            flexibleSpace: FlexibleSpaceBar(
              background: Stack(
                fit: StackFit.expand,
                children: [
                  _TourCover(
                    imageUrl: tour.coverImageUrl,
                    height: 300,
                  ),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Color(0x11000000),
                          Color(0x99000000),
                        ],
                      ),
                    ),
                  ),
                  Positioned(
                    left: 20,
                    bottom: 22,
                    child: _TourBadge(label: tour.badge),
                  ),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(
              RamoSpacing.lg,
              RamoSpacing.lg,
              RamoSpacing.lg,
              RamoSpacing.xxl,
            ),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                Text(
                  tour.title,
                  style:
                      Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w900,
                            letterSpacing: -.8,
                          ),
                ),
                const SizedBox(height: RamoSpacing.sm),
                Text(
                  tour.description,
                  style: const TextStyle(
                    color: RamoColors.muted,
                    height: 1.55,
                  ),
                ),
                const SizedBox(height: RamoSpacing.lg),
                Wrap(
                  spacing: RamoSpacing.sm,
                  runSpacing: RamoSpacing.sm,
                  children: [
                    _info(
                      context,
                      Icons.schedule_rounded,
                      'Duração',
                      tour.duration,
                    ),
                    _info(
                      context,
                      Icons.access_time_rounded,
                      'Horários',
                      tour.schedule,
                    ),
                    _info(
                      context,
                      Icons.location_on_outlined,
                      'Saída',
                      tour.departure,
                    ),
                  ],
                ),
                const SizedBox(height: RamoSpacing.lg),
                _listSection(
                  context,
                  title: 'Roteiro',
                  items: tour.highlights,
                  icon: Icons.check_circle_outline_rounded,
                ),
                _listSection(
                  context,
                  title: 'O que inclui',
                  items: tour.included,
                  icon: Icons.add_circle_outline_rounded,
                ),
                _listSection(
                  context,
                  title: 'O que não inclui',
                  items: tour.excluded,
                  icon: Icons.remove_circle_outline_rounded,
                ),
                Container(
                  padding: const EdgeInsets.all(RamoSpacing.lg),
                  decoration: BoxDecoration(
                    color: RamoColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(RamoRadius.lg),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tour.priceLabel,
                        style: const TextStyle(
                          color: RamoColors.muted,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        tour.priceCents == null
                            ? 'Consulte'
                            : _money(tour.priceCents!),
                        style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      if (tour.priceSuffix != null)
                        Text(
                          tour.priceSuffix!,
                          style: const TextStyle(
                            color: RamoColors.muted,
                          ),
                        ),
                    ],
                  ),
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class _TourBadge extends StatelessWidget {
  const _TourBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: RamoColors.success,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: 13,
          vertical: 7,
        ),
        child: Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w900,
            fontSize: 11,
            letterSpacing: .6,
          ),
        ),
      ),
    );
  }
}

class _TourCover extends StatelessWidget {
  const _TourCover({
    required this.imageUrl,
    required this.height,
  });

  final String? imageUrl;
  final double height;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl?.trim();
    if (url == null || url.isEmpty) {
      return _TourCoverPlaceholder(height: height);
    }

    return SizedBox(
      width: double.infinity,
      height: height,
      child: Image.network(
        url,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) =>
            _TourCoverPlaceholder(height: height),
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return _TourCoverPlaceholder(
            height: height,
            loading: true,
          );
        },
      ),
    );
  }
}

class _TourCoverPlaceholder extends StatelessWidget {
  const _TourCoverPlaceholder({
    required this.height,
    this.loading = false,
  });

  final double height;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: height,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF1A1A1A),
            Color(0xFF454545),
          ],
        ),
      ),
      child: Center(
        child: loading
            ? const CircularProgressIndicator(
                color: RamoColors.brandYellow,
              )
            : const Icon(
                Icons.landscape_rounded,
                size: 56,
                color: RamoColors.brandYellow,
              ),
      ),
    );
  }
}

class _ToursMessage extends StatelessWidget {
  const _ToursMessage({
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.xl),
      decoration: BoxDecoration(
        color: RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(RamoRadius.lg),
      ),
      child: Column(
        children: [
          Icon(icon, size: 42),
          const SizedBox(height: RamoSpacing.md),
          Text(
            title,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: RamoColors.muted),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: RamoSpacing.md),
            FilledButton(
              onPressed: onAction,
              child: Text(actionLabel!),
            ),
          ],
        ],
      ),
    );
  }
}
