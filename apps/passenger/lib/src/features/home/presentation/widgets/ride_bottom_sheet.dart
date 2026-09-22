import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../domain/service_type.dart';
import 'service_selector.dart';

class RideBottomSheet extends StatelessWidget {
  const RideBottomSheet({
    super.key,
    required this.selectedService,
    required this.onServiceChanged,
    required this.onOriginTap,
    required this.onDestinationTap,
    required this.onRequestRide,
    this.origin,
    this.destination,
    this.routeSummary,
    this.estimatedFare,
    this.fareCaption,
    this.pricingMessage,
    this.serviceAreaLabel,
    this.coverageMessage,
    this.routeLoading = false,
    this.pricingLoading = false,
    this.priceIsFinal = false,
    this.passengerCount = 1,
    this.onPassengerCountChanged,
  });

  final ServiceType selectedService;
  final ValueChanged<ServiceType> onServiceChanged;
  final VoidCallback onOriginTap;
  final VoidCallback onDestinationTap;
  final VoidCallback onRequestRide;
  final String? origin;
  final String? destination;
  final String? routeSummary;
  final String? estimatedFare;
  final String? fareCaption;
  final String? pricingMessage;
  final String? serviceAreaLabel;
  final String? coverageMessage;
  final bool routeLoading;
  final bool pricingLoading;
  final bool priceIsFinal;
  final int passengerCount;
  final ValueChanged<int>? onPassengerCountChanged;

  @override
  Widget build(BuildContext context) {
    final hasTrip = origin != null && destination != null;
    final canRequest = hasTrip &&
        estimatedFare != null &&
        priceIsFinal &&
        coverageMessage == null &&
        !routeLoading &&
        !pricingLoading;

    return DraggableScrollableSheet(
      initialChildSize: hasTrip ? 0.60 : 0.50,
      minChildSize: 0.40,
      maxChildSize: 0.84,
      snap: true,
      snapSizes: const [0.50, 0.84],
      builder: (context, scrollController) {
        return DecoratedBox(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(RamoRadius.lg),
            ),
            boxShadow: RamoElevation.floating(context),
          ),
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.fromLTRB(
              RamoSpacing.md,
              RamoSpacing.xs,
              RamoSpacing.md,
              RamoSpacing.xl,
            ),
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: RamoSpacing.md),
                  decoration: BoxDecoration(
                    color: Theme.of(context).dividerColor,
                    borderRadius: BorderRadius.circular(RamoRadius.pill),
                  ),
                ),
              ),
              Text(
                'Bora?',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 4),
              Text(
                'Escolha de onde sai e pra onde vai.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context)
                          .colorScheme
                          .onSurface
                          .withValues(alpha: 0.62),
                    ),
              ),
              const SizedBox(height: RamoSpacing.md),
              _LocationField(
                icon: Icons.trip_origin_rounded,
                label: 'Origem',
                value: origin ?? 'Escolher origem',
                onTap: onOriginTap,
              ),
              const SizedBox(height: RamoSpacing.xs),
              _LocationField(
                icon: Icons.flag_rounded,
                label: 'Destino',
                value: destination ?? 'Pra onde vamos?',
                onTap: onDestinationTap,
              ),
              if (routeLoading) ...[
                const SizedBox(height: RamoSpacing.sm),
                const LinearProgressIndicator(minHeight: 3),
              ],
              if (coverageMessage != null) ...[
                const SizedBox(height: RamoSpacing.sm),
                _CoverageNotice(message: coverageMessage!),
              ],
              if (routeSummary != null && !routeLoading) ...[
                const SizedBox(height: RamoSpacing.sm),
                Row(
                  children: [
                    const Icon(Icons.route_rounded, size: 18),
                    const SizedBox(width: RamoSpacing.xs),
                    Expanded(
                      child: Text(
                        serviceAreaLabel == null
                            ? routeSummary!
                            : '$routeSummary · $serviceAreaLabel',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: RamoSpacing.md),
              ServiceSelector(
                selected: selectedService,
                onChanged: onServiceChanged,
              ),
              if (selectedService == ServiceType.buggy) ...[
                const SizedBox(height: RamoSpacing.sm),
                _PassengerCounter(
                  count: passengerCount,
                  onChanged: onPassengerCountChanged,
                ),
              ],
              if (pricingMessage != null) ...[
                const SizedBox(height: RamoSpacing.sm),
                _PricingNotice(message: pricingMessage!),
              ],
              if (hasTrip) ...[
                const SizedBox(height: RamoSpacing.lg),
                AnimatedSwitcher(
                  duration: RamoMotion.standard,
                  child: Row(
                    key: ValueKey((
                      selectedService,
                      estimatedFare,
                      pricingLoading,
                    )),
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              selectedService.description,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              pricingLoading
                                  ? 'Calculando…'
                                  : estimatedFare ?? '—',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            Text(
                              fareCaption ?? 'cotação do Ramo Nessa Core',
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          ],
                        ),
                      ),
                      FilledButton(
                        onPressed: canRequest ? onRequestRide : null,
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(154, 54),
                          backgroundColor: RamoColors.signal,
                          foregroundColor: RamoColors.signalInk,
                        ),
                        child: const Text('Solicitar'),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _PassengerCounter extends StatelessWidget {
  const _PassengerCounter({
    required this.count,
    required this.onChanged,
  });

  final int count;
  final ValueChanged<int>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: RamoSpacing.sm,
        vertical: RamoSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        borderRadius: BorderRadius.circular(RamoRadius.md),
      ),
      child: Row(
        children: [
          const Icon(Icons.groups_2_rounded, size: 20),
          const SizedBox(width: RamoSpacing.xs),
          Expanded(
            child: Text(
              'Passageiros',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ),
          IconButton(
            tooltip: 'Remover passageiro',
            onPressed:
                count > 1 && onChanged != null ? () => onChanged!(count - 1) : null,
            icon: const Icon(Icons.remove_rounded),
          ),
          SizedBox(
            width: 28,
            child: Text(
              '$count',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
          ),
          IconButton(
            tooltip: 'Adicionar passageiro',
            onPressed:
                count < 4 && onChanged != null ? () => onChanged!(count + 1) : null,
            icon: const Icon(Icons.add_rounded),
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
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(RamoRadius.md),
      onTap: onTap,
      child: Ink(
        padding: const EdgeInsets.symmetric(
          horizontal: RamoSpacing.md,
          vertical: RamoSpacing.sm,
        ),
        decoration: BoxDecoration(
          color: Theme.of(context).scaffoldBackgroundColor,
          borderRadius: BorderRadius.circular(RamoRadius.md),
        ),
        child: Row(
          children: [
            Icon(icon, size: 20),
            const SizedBox(width: RamoSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded),
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
              '$message Atendemos Jeri, Jijoca, Preá e Aeroporto JJD.',
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

class _PricingNotice extends StatelessWidget {
  const _PricingNotice({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.sm),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(RamoRadius.sm),
      ),
      child: Row(
        children: [
          Icon(
            Icons.info_outline_rounded,
            size: 18,
            color: Theme.of(context).colorScheme.onSecondaryContainer,
          ),
          const SizedBox(width: RamoSpacing.xs),
          Expanded(
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSecondaryContainer,
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
