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
            const Divider(height: 1, indent: 76),
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
          duration: RamoMotion.standard,
          curve: RamoMotion.standardCurve,
          padding: const EdgeInsets.symmetric(
            horizontal: RamoSpacing.sm,
            vertical: RamoSpacing.sm,
          ),
          decoration: BoxDecoration(
            color: selected
                ? RamoColors.surfaceRaised
                : Colors.transparent,
            borderRadius: BorderRadius.circular(RamoRadius.md),
            border: Border.all(
              color: selected
                  ? RamoColors.brandBlack
                  : Colors.transparent,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              AnimatedContainer(
                duration: RamoMotion.standard,
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: selected
                      ? RamoColors.brandBlack
                      : RamoColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(17),
                ),
                child: Icon(
                  service.icon,
                  size: 25,
                  color: selected
                      ? Colors.white
                      : RamoColors.brandBlack,
                ),
              ),
              const SizedBox(width: RamoSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      service.label,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.35,
                          ),
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
              const SizedBox(width: RamoSpacing.sm),
              AnimatedSwitcher(
                duration: RamoMotion.fast,
                child: selected
                    ? Container(
                        key: const ValueKey('selected'),
                        width: 28,
                        height: 28,
                        decoration: const BoxDecoration(
                          color: RamoColors.brandYellow,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.check_rounded,
                          size: 18,
                          color: RamoColors.brandBlack,
                        ),
                      )
                    : Icon(
                        Icons.chevron_right_rounded,
                        key: const ValueKey('idle'),
                        color: scheme.onSurface.withValues(alpha: .36),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
