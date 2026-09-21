import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../domain/service_type.dart';
import 'service_selector.dart';

class RideBottomSheet extends StatelessWidget {
  const RideBottomSheet({
    super.key,
    required this.selectedService,
    required this.onServiceChanged,
    required this.onDestinationTap,
    required this.onRequestRide,
    this.destination,
  });

  final ServiceType selectedService;
  final ValueChanged<ServiceType> onServiceChanged;
  final VoidCallback onDestinationTap;
  final VoidCallback onRequestRide;
  final String? destination;

  @override
  Widget build(BuildContext context) {
    final hasDestination = destination != null;

    return DraggableScrollableSheet(
      initialChildSize: hasDestination ? 0.48 : 0.43,
      minChildSize: 0.34,
      maxChildSize: 0.72,
      snap: true,
      snapSizes: const [0.43, 0.72],
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
                'Escolha como você quer ir.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context)
                          .colorScheme
                          .onSurface
                          .withValues(alpha: 0.62),
                    ),
              ),
              const SizedBox(height: RamoSpacing.md),
              InkWell(
                borderRadius: BorderRadius.circular(RamoRadius.md),
                onTap: onDestinationTap,
                child: Ink(
                  padding: const EdgeInsets.symmetric(
                    horizontal: RamoSpacing.md,
                    vertical: RamoSpacing.md,
                  ),
                  decoration: BoxDecoration(
                    color: Theme.of(context).scaffoldBackgroundColor,
                    borderRadius: BorderRadius.circular(RamoRadius.md),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.search_rounded),
                      const SizedBox(width: RamoSpacing.sm),
                      Expanded(
                        child: Text(
                          destination ?? 'Pra onde vamos?',
                          style: Theme.of(context).textTheme.titleMedium,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const Icon(Icons.chevron_right_rounded),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: RamoSpacing.md),
              ServiceSelector(
                selected: selectedService,
                onChanged: onServiceChanged,
              ),
              if (hasDestination) ...[
                const SizedBox(height: RamoSpacing.lg),
                AnimatedSwitcher(
                  duration: RamoMotion.standard,
                  child: Row(
                    key: ValueKey(selectedService),
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
                              selectedService.previewPrice,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                          ],
                        ),
                      ),
                      FilledButton(
                        onPressed: onRequestRide,
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
