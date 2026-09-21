import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../domain/service_type.dart';

class ServiceSelector extends StatelessWidget {
  const ServiceSelector({
    super.key,
    required this.selected,
    required this.onChanged,
  });

  final ServiceType selected;
  final ValueChanged<ServiceType> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: ServiceType.values.map((service) {
        final isSelected = service == selected;

        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(
              right: service == ServiceType.delivery ? 0 : RamoSpacing.xs,
            ),
            child: Semantics(
              button: true,
              selected: isSelected,
              label: service.label,
              child: InkWell(
                borderRadius: BorderRadius.circular(RamoRadius.md),
                onTap: () => onChanged(service),
                child: AnimatedContainer(
                  duration: RamoMotion.standard,
                  curve: RamoMotion.standardCurve,
                  padding: const EdgeInsets.symmetric(
                    horizontal: RamoSpacing.xs,
                    vertical: RamoSpacing.sm,
                  ),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? Theme.of(context).colorScheme.onSurface
                        : Theme.of(context).colorScheme.surface,
                    borderRadius: BorderRadius.circular(RamoRadius.md),
                    border: Border.all(
                      color: isSelected
                          ? Theme.of(context).colorScheme.onSurface
                          : Theme.of(context).dividerColor,
                    ),
                  ),
                  child: Column(
                    children: [
                      AnimatedScale(
                        scale: isSelected ? 1.08 : 1,
                        duration: RamoMotion.standard,
                        child: Icon(
                          service.icon,
                          size: 25,
                          color: isSelected
                              ? Theme.of(context).colorScheme.surface
                              : Theme.of(context).colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: RamoSpacing.xs),
                      Text(
                        service.label,
                        style: Theme.of(context).textTheme.labelLarge?.copyWith(
                              color: isSelected
                                  ? Theme.of(context).colorScheme.surface
                                  : Theme.of(context).colorScheme.onSurface,
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        service.previewEta,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: isSelected
                                  ? Theme.of(context)
                                      .colorScheme
                                      .surface
                                      .withValues(alpha: 0.72)
                                  : Theme.of(context)
                                      .colorScheme
                                      .onSurface
                                      .withValues(alpha: 0.55),
                            ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}
