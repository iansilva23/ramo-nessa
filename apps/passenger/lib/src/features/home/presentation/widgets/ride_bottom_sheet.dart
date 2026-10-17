import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

/// A floating, content-sized route panel. It leaves the rest of the map
/// interactive and never stretches a pointer interceptor over the viewport.
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
    final canContinue = hasTrip && routeSummary != null &&
        coverageMessage == null && !routeLoading;
    final colors = Theme.of(context).colorScheme;

    return Align(
      alignment: Alignment.bottomCenter,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          RamoSpacing.md, 0, RamoSpacing.md, RamoSpacing.sm,
        ),
        // On the Web, intercept the actual controls, not the whole map.
        child: RamoWebMapOverlay(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 540),
            child: SingleChildScrollView(
              child: AnimatedSize(
                duration: const Duration(milliseconds: 260),
                curve: Curves.easeOutCubic,
                alignment: Alignment.bottomCenter,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Material(
                      key: const Key('floating-trip-card'),
                      color: colors.surface,
                      elevation: 3,
                      shadowColor: Colors.black26,
                      clipBehavior: Clip.antiAlias,
                      borderRadius: BorderRadius.circular(26),
                      child: _TripCard(
                        origin: origin ?? 'Escolher origem',
                        destination: destination ?? 'Pra onde vamos?',
                        onOriginTap: onOriginTap,
                        onDestinationTap: onDestinationTap,
                        onDestinationClear: onDestinationClear,
                      ),
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
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Container(
                          key: const Key('floating-route-summary'),
                          decoration: BoxDecoration(
                            color: colors.surfaceContainerHigh,
                            borderRadius: BorderRadius.circular(RamoRadius.pill),
                          ),
                          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Icon(Icons.route_rounded, color: colors.onSurface, size: 17),
                            const SizedBox(width: 7),
                            Flexible(
                              child: Text(
                                serviceAreaLabel == null
                                    ? routeSummary!
                                    : '$routeSummary · $serviceAreaLabel',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: colors.onSurface,
                                ),
                              ),
                            ),
                          ]),
                        ),
                      ),
                    ],
                    if (hasTrip) ...[
                      const SizedBox(height: RamoSpacing.md),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 7),
                        child: SizedBox(
                          height: 54,
                          child: FilledButton(
                            key: const Key('confirm-destination-button'),
                            onPressed: canContinue ? onContinue : null,
                            style: FilledButton.styleFrom(
                              backgroundColor: RamoColors.brandBlack,
                              foregroundColor: Colors.white,
                              disabledBackgroundColor: colors.surfaceContainerHighest,
                              disabledForegroundColor: colors.onSurfaceVariant,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            child: Text(
                              routeLoading ? 'Calculando rota…' : 'Confirmar destino',
                              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
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
        color: Colors.transparent,
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
                color: destination ? Colors.white : Theme.of(context).colorScheme.onSurface,
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
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
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
