import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../domain/service_type.dart';

class ServiceSelector extends StatelessWidget {
  const ServiceSelector({
    super.key,
    required this.selected,
    required this.onChanged,
    this.services = ServiceType.values,
  });

  final ServiceType selected;
  final ValueChanged<ServiceType> onChanged;
  final List<ServiceType> services;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var index = 0; index < services.length; index++) ...[
          _ServiceRow(
            service: services[index],
            selected: services[index] == selected,
            onTap: () => onChanged(services[index]),
          ),
          if (index != services.length - 1)
            Divider(
              height: 1,
              indent: 68,
              color: Theme.of(context).dividerColor.withValues(alpha: .42),
            ),
        ],
      ],
    );
  }
}

class _ServiceRow extends StatelessWidget {
  const _ServiceRow({
    required this.service,
    required this.selected,
    required this.onTap,
  });

  final ServiceType service;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Semantics(
      button: true,
      selected: selected,
      label: service.label,
      child: InkWell(
        borderRadius: BorderRadius.circular(RamoRadius.md),
        onTap: onTap,
        child: AnimatedContainer(
          duration: RamoMotion.fast,
          curve: RamoMotion.standardCurve,
          padding: const EdgeInsets.symmetric(
            horizontal: RamoSpacing.xs,
            vertical: 9,
          ),
          decoration: BoxDecoration(
            color: selected
                ? RamoColors.surfaceRaised
                : Colors.transparent,
            borderRadius: BorderRadius.circular(RamoRadius.md),
          ),
          child: Row(
            children: [
              AnimatedContainer(
                duration: RamoMotion.fast,
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: selected
                      ? RamoColors.brandYellow
                      : RamoColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(
                  service.icon,
                  size: 23,
                  color: RamoColors.brandBlack,
                ),
              ),
              const SizedBox(width: RamoSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            service.label,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: -0.4,
                                ),
                          ),
                        ),

                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      service.description,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: RamoColors.muted,
                          ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: RamoSpacing.xs),
              AnimatedSwitcher(
                duration: RamoMotion.fast,
                child: selected
                    ? const Icon(
                        Icons.check_circle_rounded,
                        key: ValueKey('selected'),
                        color: RamoColors.brandBlack,
                        size: 22,
                      )
                    : Icon(
                        Icons.chevron_right_rounded,
                        key: const ValueKey('idle'),
                        color: scheme.onSurface.withValues(alpha: .28),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
