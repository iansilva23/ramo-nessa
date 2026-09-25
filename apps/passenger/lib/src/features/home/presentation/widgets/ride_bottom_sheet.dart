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
    this.availableServices = ServiceType.values,
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
  final List<ServiceType> availableServices;

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
      initialChildSize: hasTrip ? 0.62 : 0.44,
      minChildSize: hasTrip ? 0.46 : 0.38,
      maxChildSize: 0.91,
      snap: true,
      snapSizes: hasTrip ? const [0.62, 0.91] : const [0.44, 0.80],
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
                  margin: const EdgeInsets.only(bottom: RamoSpacing.md),
                  decoration: BoxDecoration(
                    color: Theme.of(context).dividerColor,
                    borderRadius: BorderRadius.circular(RamoRadius.pill),
                  ),
                ),
              ),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      hasTrip ? 'Sua viagem' : 'Vamos nessa?',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.9,
                          ),
                    ),
                  ),
                  if (hasTrip && routeSummary != null)
                    _RouteBadge(label: routeSummary!),
                ],
              ),
              if (!hasTrip) ...[
                const SizedBox(height: 3),
                Text(
                  'Escolha onde você está e pra onde quer ir.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: RamoColors.muted,
                      ),
                ),
              ],
              const SizedBox(height: RamoSpacing.md),
              _TripCard(
                origin: origin ?? 'Escolher origem',
                destination: destination ?? 'Pra onde vamos?',
                onOriginTap: onOriginTap,
                onDestinationTap: onDestinationTap,
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
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: RamoColors.muted,
                            ),
                      ),
                    ),
                  ],
                ),
              ],
              if (hasTrip) ...[
                const SizedBox(height: RamoSpacing.lg),
                Text(
                  'Escolha uma opção',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                ),
                const SizedBox(height: RamoSpacing.xs),
                ServiceSelector(
                  selected: selectedService,
                  services: availableServices,
                  onChanged: onServiceChanged,
                ),
              ],
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
                    child: AnimatedSwitcher(
                      duration: RamoMotion.standard,
                      child: _PriceAction(
                        key: ValueKey((
                          selectedService,
                          estimatedFare,
                          pricingLoading,
                        )),
                        estimatedFare: estimatedFare,
                        fareCaption: fareCaption,
                        pricingLoading: pricingLoading,
                        priceIsFinal: priceIsFinal,
                        canRequest: canRequest,
                        onRequestRide: onRequestRide,
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
  });

  final String origin;
  final String destination;
  final VoidCallback onOriginTap;
  final VoidCallback onDestinationTap;

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
          ),
        ],
      ),
    );
  }
}

class _RouteBadge extends StatelessWidget {
  const _RouteBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: RamoSpacing.sm,
        vertical: 7,
      ),
      decoration: BoxDecoration(
        color: RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(RamoRadius.pill),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
            ),
      ),
    );
  }
}

class _PriceAction extends StatelessWidget {
  const _PriceAction({
    super.key,
    required this.estimatedFare,
    required this.fareCaption,
    required this.pricingLoading,
    required this.priceIsFinal,
    required this.canRequest,
    required this.onRequestRide,
  });

  final String? estimatedFare;
  final String? fareCaption;
  final bool pricingLoading;
  final bool priceIsFinal;
  final bool canRequest;
  final VoidCallback onRequestRide;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    priceIsFinal ? 'Preço final' : 'Estimativa',
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          color: RamoColors.muted,
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    fareCaption ?? 'Valor da sua corrida',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: RamoColors.muted,
                        ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: RamoSpacing.sm),
            Text(
              pricingLoading ? 'Calculando…' : estimatedFare ?? '—',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.8,
                  ),
            ),
          ],
        ),
        const SizedBox(height: RamoSpacing.sm),
        SizedBox(
          height: 54,
          child: FilledButton(
            key: const Key('request-ride-button'),
            onPressed: canRequest ? onRequestRide : null,
            style: FilledButton.styleFrom(
              backgroundColor: RamoColors.brandBlack,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: const Text(
              'Solicitar corrida',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 15,
              ),
            ),
          ),
        ),
      ],
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
        color: RamoColors.surfaceRaised,
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
    this.destination = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;
  final bool destination;

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
            Icon(
              Icons.chevron_right_rounded,
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: .35),
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
