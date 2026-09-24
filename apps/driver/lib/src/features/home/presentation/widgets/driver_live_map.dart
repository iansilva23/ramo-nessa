import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../../core/config/driver_map_config.dart';
import '../../domain/driver_models.dart';
import '../../domain/driver_route_info.dart';

class DriverLiveMap extends StatelessWidget {
  const DriverLiveMap({
    super.key,
    required this.controller,
    required this.supply,
    required this.activeRide,
    required this.route,
    this.nearbyDrivers = const [],
    this.onMapReady,
    this.networkTilesEnabled = true,
  });

  final MapController controller;
  final DriverSupplySnapshot? supply;
  final AcceptedDriverRide? activeRide;
  final DriverRouteInfo? route;
  final List<NearbyDriverPosition> nearbyDrivers;
  final VoidCallback? onMapReady;
  final bool networkTilesEnabled;

  @override
  Widget build(BuildContext context) {
    final driverPoint = supply == null
        ? DriverMapConfig.fallbackCenter
        : LatLng(supply!.latitude, supply!.longitude);

    final pickup = activeRide?.pickupLatitude == null ||
            activeRide?.pickupLongitude == null
        ? null
        : LatLng(
            activeRide!.pickupLatitude!,
            activeRide!.pickupLongitude!,
          );

    final dropoff = activeRide?.dropoffLatitude == null ||
            activeRide?.dropoffLongitude == null
        ? null
        : LatLng(
            activeRide!.dropoffLatitude!,
            activeRide!.dropoffLongitude!,
          );

    final markers = <Marker>[
      ...nearbyDrivers.map(
        (driver) => Marker(
          point: LatLng(driver.latitude, driver.longitude),
          width: 34,
          height: 34,
          child: _NearbyDriverMarker(busy: driver.busy),
        ),
      ),
      Marker(
        point: driverPoint,
        width: 56,
        height: 56,
        child: const _DriverMarker(),
      ),
      if (pickup != null)
        Marker(
          point: pickup,
          width: 48,
          height: 48,
          child: const _PickupMarker(),
        ),
      if (dropoff != null)
        Marker(
          point: dropoff,
          width: 48,
          height: 52,
          child: const _DropoffMarker(),
        ),
    ];

    return FlutterMap(
      mapController: controller,
      options: MapOptions(
        initialCenter: driverPoint,
        initialZoom: DriverMapConfig.fallbackZoom,
        minZoom: 4,
        maxZoom: 19,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        onMapReady: onMapReady,
      ),
      children: [
        if (networkTilesEnabled)
          TileLayer(
            urlTemplate: DriverMapConfig.osmTileUrl,
            userAgentPackageName: 'br.com.ramonessa.driver',
            tileProvider: NetworkTileProvider(
              headers: const {
                'User-Agent': DriverMapConfig.userAgent,
              },
            ),
          ),
        if (route != null && route!.points.length >= 2)
          PolylineLayer(
            polylines: [
              Polyline(
                points: route!.points,
                strokeWidth: 7,
                color: RamoColors.brandBlack,
                borderStrokeWidth: 2,
                borderColor: Colors.white,
              ),
            ],
          ),
        MarkerLayer(markers: markers),
      ],
    );
  }
}

class _DriverMarker extends StatelessWidget {
  const _DriverMarker();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: RamoColors.brandBlack,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 4),
          boxShadow: RamoElevation.floating(context),
        ),
        child: const Icon(
          Icons.navigation_rounded,
          color: RamoColors.brandYellow,
          size: 22,
        ),
      ),
    );
  }
}

class _PickupMarker extends StatelessWidget {
  const _PickupMarker();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          border: Border.all(color: RamoColors.brandBlack, width: 4),
          boxShadow: RamoElevation.floating(context),
        ),
        child: const Center(
          child: SizedBox.square(
            dimension: 8,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: RamoColors.brandBlack,
                shape: BoxShape.circle,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DropoffMarker extends StatelessWidget {
  const _DropoffMarker();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: RamoColors.brandYellow,
          shape: BoxShape.circle,
          border: Border.all(color: RamoColors.brandBlack, width: 3),
          boxShadow: RamoElevation.floating(context),
        ),
        child: const Icon(
          Icons.flag_rounded,
          color: RamoColors.brandBlack,
          size: 20,
        ),
      ),
    );
  }
}


class _NearbyDriverMarker extends StatelessWidget {
  const _NearbyDriverMarker({required this.busy});

  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 26,
        height: 26,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          border: Border.all(
            color: busy ? RamoColors.muted : RamoColors.brandBlack,
            width: 2.5,
          ),
          boxShadow: RamoElevation.floating(context),
        ),
        child: Icon(
          Icons.directions_car_filled_rounded,
          size: 14,
          color: busy ? RamoColors.muted : RamoColors.brandBlack,
        ),
      ),
    );
  }
}
