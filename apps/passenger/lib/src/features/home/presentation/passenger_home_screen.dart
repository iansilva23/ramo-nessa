import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../domain/service_type.dart';
import 'destination_search_screen.dart';
import 'finding_driver_screen.dart';
import 'widgets/ramo_map_preview.dart';
import 'widgets/ride_bottom_sheet.dart';

class PassengerHomeScreen extends StatefulWidget {
  const PassengerHomeScreen({super.key});

  @override
  State<PassengerHomeScreen> createState() => _PassengerHomeScreenState();
}

class _PassengerHomeScreenState extends State<PassengerHomeScreen> {
  ServiceType _service = ServiceType.car;
  String? _destination;

  Future<void> _chooseDestination() async {
    final destination = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => const DestinationSearchScreen(),
      ),
    );

    if (destination != null && mounted) {
      setState(() => _destination = destination);
    }
  }

  void _requestRide() {
    final destination = _destination;
    if (destination == null) {
      _chooseDestination();
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => FindingDriverScreen(
          service: _service,
          destination: destination,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: RamoMapPreview(showRoute: _destination != null),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(RamoSpacing.md),
              child: Row(
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surface,
                      borderRadius: BorderRadius.circular(RamoRadius.pill),
                      boxShadow: RamoElevation.floating(context),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: RamoSpacing.md,
                        vertical: RamoSpacing.sm,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 11,
                            height: 11,
                            decoration: const BoxDecoration(
                              color: RamoColors.signal,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: RamoSpacing.xs),
                          const Text(
                            'Ramo Nessa',
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const Spacer(),
                  IconButton.filledTonal(
                    tooltip: 'Minha localização',
                    onPressed: () {},
                    icon: const Icon(Icons.my_location_rounded),
                  ),
                  const SizedBox(width: RamoSpacing.xs),
                  IconButton.filled(
                    tooltip: 'Perfil',
                    onPressed: () {},
                    icon: const Icon(Icons.person_rounded),
                  ),
                ],
              ),
            ),
          ),
          RideBottomSheet(
            selectedService: _service,
            destination: _destination,
            onDestinationTap: _chooseDestination,
            onServiceChanged: (service) {
              setState(() => _service = service);
            },
            onRequestRide: _requestRide,
          ),
        ],
      ),
    );
  }
}
