import 'dart:async';

import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../domain/service_type.dart';
import 'widgets/ramo_map_preview.dart';

class FindingDriverScreen extends StatefulWidget {
  const FindingDriverScreen({
    super.key,
    required this.service,
    required this.destination,
  });

  final ServiceType service;
  final String destination;

  @override
  State<FindingDriverScreen> createState() => _FindingDriverScreenState();
}

class _FindingDriverScreenState extends State<FindingDriverScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat();

  Timer? _mockTimer;
  bool _driverFound = false;

  @override
  void initState() {
    super.initState();

    // Protótipo visual: será substituído por evento real do Ramo Nessa Core.
    _mockTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) {
        setState(() => _driverFound = true);
      }
    });
  }

  @override
  void dispose() {
    _mockTimer?.cancel();
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: RamoMapPreview(showRoute: true)),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(RamoSpacing.md),
              child: Align(
                alignment: Alignment.topLeft,
                child: IconButton.filled(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded),
                ),
              ),
            ),
          ),
          if (!_driverFound)
            Center(
              child: AnimatedBuilder(
                animation: _pulse,
                builder: (context, child) {
                  final scale = 0.82 + (_pulse.value * 0.30);
                  final opacity = 1 - _pulse.value;
                  return Stack(
                    alignment: Alignment.center,
                    children: [
                      Transform.scale(
                        scale: scale,
                        child: Opacity(
                          opacity: opacity,
                          child: Container(
                            width: 150,
                            height: 150,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: RamoColors.signal,
                                width: 3,
                              ),
                            ),
                          ),
                        ),
                      ),
                      child!,
                    ],
                  );
                },
                child: Container(
                  width: 86,
                  height: 86,
                  decoration: BoxDecoration(
                    color: RamoColors.ink,
                    shape: BoxShape.circle,
                    boxShadow: RamoElevation.floating(context),
                  ),
                  child: Icon(
                    widget.service.icon,
                    color: RamoColors.signal,
                    size: 36,
                  ),
                ),
              ),
            ),
          Align(
            alignment: Alignment.bottomCenter,
            child: AnimatedSwitcher(
              duration: RamoMotion.emphasized,
              switchInCurve: RamoMotion.emphasizedCurve,
              child: _driverFound
                  ? _DriverFoundCard(
                      key: const ValueKey('driver-found'),
                      destination: widget.destination,
                    )
                  : _SearchingCard(
                      key: const ValueKey('searching'),
                      service: widget.service,
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SearchingCard extends StatelessWidget {
  const _SearchingCard({
    super.key,
    required this.service,
  });

  final ServiceType service;

  @override
  Widget build(BuildContext context) {
    return _BottomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Procurando ${service.label.toLowerCase()} por perto…',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: RamoSpacing.xs),
          Text(
            'Isso normalmente leva só alguns instantes.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: RamoSpacing.md),
          const LinearProgressIndicator(
            minHeight: 4,
            color: RamoColors.signal,
          ),
        ],
      ),
    );
  }
}

class _DriverFoundCard extends StatelessWidget {
  const _DriverFoundCard({
    super.key,
    required this.destination,
  });

  final String destination;

  @override
  Widget build(BuildContext context) {
    return _BottomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Motorista encontrado',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: RamoSpacing.md),
          Row(
            children: [
              const CircleAvatar(
                radius: 28,
                child: Icon(Icons.person_rounded, size: 30),
              ),
              const SizedBox(width: RamoSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Carlos',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      '★ 4,9 · Honda CG 160 · ABC1D23',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    Text(
                      'Destino: $destination',
                      style: Theme.of(context).textTheme.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: RamoSpacing.sm,
                  vertical: RamoSpacing.xs,
                ),
                decoration: BoxDecoration(
                  color: RamoColors.signal,
                  borderRadius: BorderRadius.circular(RamoRadius.pill),
                ),
                child: const Text(
                  '3 min',
                  style: TextStyle(
                    color: RamoColors.signalInk,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BottomCard extends StatelessWidget {
  const _BottomCard({
    required this.child,
  });

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.all(RamoSpacing.md),
      padding: const EdgeInsets.all(RamoSpacing.lg),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(RamoRadius.lg),
        boxShadow: RamoElevation.floating(context),
      ),
      child: SafeArea(top: false, child: child),
    );
  }
}
