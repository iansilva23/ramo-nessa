import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

class RideBottomSheet extends StatelessWidget {
  const RideBottomSheet({
    super.key,
    required this.onOriginTap,
    required this.onDestinationTap,
    required this.onContinue,
    this.onDestinationClear,
    this.origin,
    this.destination,
    this.routeSummary,
    this.serviceAreaLabel,
    this.coverageMessage,
    this.routeLoading = false,
  });

  final VoidCallback onOriginTap;
  final VoidCallback onDestinationTap;
  final VoidCallback onContinue;
  final VoidCallback? onDestinationClear;
  final String? origin;
  final String? destination;
  final String? routeSummary;
  final String? serviceAreaLabel;
  final String? coverageMessage;
  final bool routeLoading;

  @override
  Widget build(BuildContext context) {
    final hasTrip = origin != null && destination != null;
    final canContinue =
        hasTrip &&
        routeSummary != null &&
        coverageMessage == null &&
        !routeLoading;

    return DraggableScrollableSheet(
      initialChildSize: hasTrip ? 0.48 : 0.42,
      minChildSize: hasTrip ? 0.40 : 0.36,
      maxChildSize: 0.76,
      snap: true,
      snapSizes: hasTrip ? const [0.48, 0.76] : const [0.42, 0.70],
      builder: (context, scrollController) {
        return DecoratedBox(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(28),
            ),
            boxShadow: RamoElevation.floating(context),
          ),
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(
                    RamoSpacing.md,
                    RamoSpacing.xs,
                    RamoSpacing.md,
                    RamoSpacing.md,
                  ),
                  children: [
                    Center(
                      child: Container(
                        width: 36,
                        height: 4,
                        margin: const EdgeInsets.only(
                          bottom: RamoSpacing.md,
                        ),
                        decoration: BoxDecoration(
                          color: Theme.of(context).dividerColor,
                          borderRadius:
                              BorderRadius.circular(RamoRadius.pill),
                        ),
                      ),
                    ),
                    Text(
                      hasTrip ? 'Confira sua rota' : 'Escolha seu destino',
                      style:
                          Theme.of(context).textTheme.headlineSmall?.copyWith(
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.9,
                              ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      hasTrip
                          ? 'Primeiro escolha o local. O veículo e o pagamento vêm nas próximas etapas.'
                          : 'Escolha sua origem e o destino no mapa.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: RamoColors.muted,
                          ),
                    ),
                    const SizedBox(height: RamoSpacing.md),
                    _TripCard(
                      origin: origin ?? 'Escolher origem',
                      destination: destination ?? 'Pra onde vamos?',
                      onOriginTap: onOriginTap,
                      onDestinationTap: onDestinationTap,
                      onDestinationClear: onDestinationClear,
                    ),
                    if (routeLoading) ...[
                      const SizedBox(height: RamoSpacing.sm),
                      const ClipRRect(
                        borderRadius: BorderRadius.all(Radius.circular(99)),
                        child: LinearProgressIndicator(minHeight: 3),
                      ),
                    ],
                    if (coverageMessage != null) ...[
                      const SizedBox(height: RamoSpacing.sm),
                      _CoverageNotice(message: coverageMessage!),
                    ],
                    if (routeSummary != null && !routeLoading) ...[
                      const SizedBox(height: RamoSpacing.sm),
                      Row(
                        children: [
                          const Icon(Icons.route_rounded, size: 17),
                          const SizedBox(width: RamoSpacing.xs),
                          Expanded(
                            child: Text(
                              serviceAreaLabel == null
                                  ? routeSummary!
                                  : '$routeSummary · $serviceAreaLabel',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: RamoColors.muted,
                                  ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              if (hasTrip)
                Container(
                  padding: const EdgeInsets.fromLTRB(
                    RamoSpacing.md,
                    RamoSpacing.sm,
                    RamoSpacing.md,
                    RamoSpacing.md,
                  ),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    border: Border(
                      top: BorderSide(
                        color: Theme.of(context)
                            .dividerColor
                            .withValues(alpha: .35),
                      ),
                    ),
                  ),
                  child: SafeArea(
                    top: false,
                    child: SizedBox(
                      width: double.infinity,
                      height: 54,
                      child: FilledButton(
                        key: const Key('confirm-destination-button'),
                        onPressed: canContinue ? onContinue : null,
                        style: FilledButton.styleFrom(
                          backgroundColor: RamoColors.brandBlack,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        child: Text(
                          routeLoading
                              ? 'Calculando rota…'
                              : 'Confirmar destino',
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 15,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _TripCard extends StatelessWidget {
  const _TripCard({
    required this.origin,
    required this.destination,
    required this.onOriginTap,
    required this.onDestinationTap,
    this.onDestinationClear,
  });

  final String origin;
  final String destination;
  final VoidCallback onOriginTap;
  final VoidCallback onDestinationTap;
  final VoidCallback? onDestinationClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(RamoRadius.lg),
      ),
      child: Column(
        children: [
          _LocationField(
            icon: Icons.my_location_rounded,
            label: 'Origem',
            value: origin,
            onTap: onOriginTap,
          ),
          Divider(
            height: 1,
            indent: 48,
            endIndent: RamoSpacing.sm,
            color: Theme.of(context).dividerColor.withValues(alpha: .55),
          ),
          _LocationField(
            icon: Icons.location_on_rounded,
            label: 'Destino',
            value: destination,
            onTap: onDestinationTap,
            destination: true,
            trailingAction: onDestinationClear,
          ),
        ],
      ),
    );
  }
}

class _LocationField extends StatelessWidget {
  const _LocationField({
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
    this.destination = false,
    this.trailingAction,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;
  final bool destination;
  final VoidCallback? trailingAction;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(RamoRadius.lg),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: RamoSpacing.md,
          vertical: 13,
        ),
        child: Row(
          children: [
            Container(
              width: 30,
              height: 30,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: destination
                    ? RamoColors.brandBlack
                    : Theme.of(context).colorScheme.surface,
                shape: BoxShape.circle,
              ),
              child: Icon(
                icon,
                size: 16,
                color: destination ? Colors.white : RamoColors.brandBlack,
              ),
            ),
            const SizedBox(width: RamoSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: RamoColors.muted,
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                ],
              ),
            ),
            if (trailingAction != null)
              IconButton(
                tooltip: 'Remover destino',
                onPressed: trailingAction,
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.close_rounded),
              )
            else
              Icon(
                Icons.chevron_right_rounded,
                color: Theme.of(context)
                    .colorScheme
                    .onSurface
                    .withValues(alpha: .35),
              ),
          ],
        ),
      ),
    );
  }
}

class _CoverageNotice extends StatelessWidget {
  const _CoverageNotice({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.sm),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(RamoRadius.sm),
      ),
      child: Row(
        children: [
          Icon(
            Icons.location_off_rounded,
            size: 18,
            color: Theme.of(context).colorScheme.onErrorContainer,
          ),
          const SizedBox(width: RamoSpacing.xs),
          Expanded(
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onErrorContainer,
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
