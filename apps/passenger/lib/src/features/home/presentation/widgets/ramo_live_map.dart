import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../../core/config/ramo_map_config.dart';
import '../../../map/domain/ramo_place.dart';

class RamoLiveMap extends StatelessWidget {
  const RamoLiveMap({
    super.key,
    required this.controller,
    required this.origin,
    required this.destination,
    required this.routePoints,
    this.onMapReady,
    this.networkTilesEnabled = true,
  });

  final MapController controller;
  final RamoPlace? origin;
  final RamoPlace? destination;
  final List<LatLng> routePoints;
  final VoidCallback? onMapReady;
  final bool networkTilesEnabled;

  @override
  Widget build(BuildContext context) {
    final markers = <Marker>[
      if (origin != null)
        Marker(
          point: origin!.position,
          width: 48,
          height: 48,
          child: const _OriginMarker(),
        ),
      if (destination != null)
        Marker(
          point: destination!.position,
          width: 52,
          height: 58,
          child: const _DestinationMarker(),
        ),
    ];

    return Stack(
      children: [
        FlutterMap(
          mapController: controller,
          options: MapOptions(
            initialCenter: RamoMapConfig.fallbackCenter,
            initialZoom: RamoMapConfig.fallbackZoom,
            minZoom: 4,
            maxZoom: 19,
            backgroundColor: Theme.of(context).scaffoldBackgroundColor,
            onMapReady: onMapReady,
          ),
          children: [
            if (networkTilesEnabled)
              TileLayer(
                urlTemplate: RamoMapConfig.osmTileUrl,
                userAgentPackageName: 'br.com.ramonessa.passenger',
                tileProvider: NetworkTileProvider(
                  headers: const {
                    'User-Agent': RamoMapConfig.userAgent,
                  },
                ),
              ),
            if (routePoints.length >= 2)
              PolylineLayer(
                polylines: [
                  Polyline(
                    points: routePoints,
                    strokeWidth: 6,
                    color: Theme.of(context).brightness == Brightness.dark
                        ? RamoColors.signal
                        : RamoColors.ink,
                  ),
                ],
              ),
            if (markers.isNotEmpty) MarkerLayer(markers: markers),
          ],
        ),
        if (networkTilesEnabled)
          Positioned(
            top: 76,
            left: 12,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .surface
                      .withValues(alpha: 0.86),
                  borderRadius: BorderRadius.circular(RamoRadius.sm),
                ),
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  child: Text(
                    '© OpenStreetMap contributors · Rotas: OSRM',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _OriginMarker extends StatelessWidget {
  const _OriginMarker();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: RamoColors.signal,
          shape: BoxShape.circle,
          border: Border.all(color: RamoColors.ink, width: 4),
          boxShadow: RamoElevation.floating(context),
        ),
        child: const Center(
          child: SizedBox.square(
            dimension: 6,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: RamoColors.ink,
                shape: BoxShape.circle,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DestinationMarker extends StatelessWidget {
  const _DestinationMarker();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: RamoColors.ink,
          shape: BoxShape.circle,
          boxShadow: RamoElevation.floating(context),
        ),
        child: const Icon(
          Icons.flag_rounded,
          color: RamoColors.signal,
          size: 20,
        ),
      ),
    );
  }
}
