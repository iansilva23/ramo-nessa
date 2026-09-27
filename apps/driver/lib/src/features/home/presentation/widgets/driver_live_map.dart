import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart' as domain;
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../../core/config/driver_map_config.dart';
import '../../../../core/map/ramo_map_marker_icons.dart';
import '../../domain/driver_models.dart';
import '../../domain/driver_route_info.dart';

@visibleForTesting
List<domain.LatLng> driverVisibleRoutePoints(
  List<domain.LatLng> points,
  double progress,
) {
  if (points.length < 2) return points;
  final clamped = progress.clamp(0.0, 1.0).toDouble();
  if (clamped >= 1) return points;

  final scaled = clamped * (points.length - 1);
  final segment = scaled.floor().clamp(0, points.length - 2).toInt();
  final segmentProgress = scaled - segment;
  final from = points[segment];
  final to = points[segment + 1];
  return [
    ...points.take(segment + 1),
    domain.LatLng(
      from.latitude + (to.latitude - from.latitude) * segmentProgress,
      from.longitude + (to.longitude - from.longitude) * segmentProgress,
    ),
  ];
}

class DriverMapController {
  gm.GoogleMapController? _nativeController;
  bool _disposed = false;
  double _currentZoom = DriverMapConfig.fallbackZoom;

  bool get ready => !_disposed && _nativeController != null;

  double get currentZoom => _currentZoom;

  void attach(gm.GoogleMapController controller) {
    if (_disposed) return;
    _nativeController = controller;
  }

  void updateCamera(gm.CameraPosition position) {
    _currentZoom = position.zoom;
  }

  void detach() {
    _nativeController = null;
  }

  Future<void> move(domain.LatLng point, [double? zoom]) async {
    final controller = _nativeController;
    if (!ready || controller == null) return;

    final targetZoom = zoom ?? _currentZoom;
    _currentZoom = targetZoom;

    await controller.animateCamera(
      gm.CameraUpdate.newLatLngZoom(
        gm.LatLng(point.latitude, point.longitude),
        targetZoom,
      ),
    );
  }

  Future<void> fitCoordinates(
    List<domain.LatLng> coordinates, {
    double padding = 90,
    double maxZoom = 16.5,
  }) async {
    final controller = _nativeController;
    if (!ready || controller == null || coordinates.isEmpty) return;
    if (coordinates.length == 1) {
      await move(coordinates.first, maxZoom);
      return;
    }

    var minLatitude = coordinates.first.latitude;
    var maxLatitude = coordinates.first.latitude;
    var minLongitude = coordinates.first.longitude;
    var maxLongitude = coordinates.first.longitude;
    for (final point in coordinates.skip(1)) {
      minLatitude = math.min(minLatitude, point.latitude);
      maxLatitude = math.max(maxLatitude, point.latitude);
      minLongitude = math.min(minLongitude, point.longitude);
      maxLongitude = math.max(maxLongitude, point.longitude);
    }

    await controller.animateCamera(
      gm.CameraUpdate.newLatLngBounds(
        gm.LatLngBounds(
          southwest: gm.LatLng(minLatitude, minLongitude),
          northeast: gm.LatLng(maxLatitude, maxLongitude),
        ),
        padding,
      ),
    );
    final currentZoom = await controller.getZoomLevel();
    if (currentZoom > maxZoom) {
      await controller.animateCamera(gm.CameraUpdate.zoomTo(maxZoom));
    }
  }

  void dispose() {
    _disposed = true;
    detach();
  }
}

class DriverLiveMap extends StatefulWidget {
  const DriverLiveMap({
    super.key,
    required this.controller,
    required this.supply,
    required this.activeRide,
    required this.route,
    this.navigationMode = false,
    this.nearbyDrivers = const [],
    this.onMapReady,
    this.networkTilesEnabled = true,
  });

  final DriverMapController controller;
  final DriverSupplySnapshot? supply;
  final AcceptedDriverRide? activeRide;
  final DriverRouteInfo? route;
  final bool navigationMode;
  final List<NearbyDriverPosition> nearbyDrivers;
  final VoidCallback? onMapReady;
  final bool networkTilesEnabled;

  @override
  State<DriverLiveMap> createState() => _DriverLiveMapState();
}

class _DriverLiveMapState extends State<DriverLiveMap>
    with TickerProviderStateMixin {
  gm.GoogleMapController? _nativeController;
  bool _placeholderReadyNotified = false;
  double _driverBearing = 0;
  double _displayDriverBearing = 0;
  double _driverAnimationBearingFrom = 0;
  domain.LatLng? _displayDriverPoint;
  domain.LatLng? _driverAnimationFrom;
  domain.LatLng? _driverAnimationTo;
  late final AnimationController _driverMoveController;
  late final AnimationController _routeDrawController;
  gm.BitmapDescriptor _passengerIcon =
      gm.BitmapDescriptor.defaultMarker;
  gm.BitmapDescriptor _destinationIcon =
      gm.BitmapDescriptor.defaultMarker;
  final Map<String, gm.BitmapDescriptor> _vehicleIcons = {};

  domain.LatLng get _driverPoint {
    final animated = _displayDriverPoint;
    if (animated != null) return animated;
    final supply = widget.supply;
    if (supply == null) return DriverMapConfig.fallbackCenter;
    return domain.LatLng(supply.latitude, supply.longitude);
  }

  @override
  void initState() {
    super.initState();
    final supply = widget.supply;
    if (supply != null) {
      _displayDriverPoint =
          domain.LatLng(supply.latitude, supply.longitude);
    }
    _driverMoveController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 720),
    )..addListener(_tickDriverMovement);
    _routeDrawController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 950),
    )..addListener(_tickRouteDrawing);
    if ((widget.route?.points.length ?? 0) >= 2) {
      _routeDrawController.forward(from: 0);
    }
    _notifyPlaceholderReadyIfNeeded();
    _loadMarkerIcons();
  }

  void _tickRouteDrawing() {
    if (mounted) setState(() {});
  }

  bool _sameRoute(DriverRouteInfo? previous, DriverRouteInfo? next) {
    final previousPoints = previous?.points ?? const <domain.LatLng>[];
    final nextPoints = next?.points ?? const <domain.LatLng>[];
    if (previousPoints.length != nextPoints.length) return false;
    for (var index = 0; index < previousPoints.length; index += 1) {
      if (previousPoints[index].latitude != nextPoints[index].latitude ||
          previousPoints[index].longitude != nextPoints[index].longitude) {
        return false;
      }
    }
    return true;
  }

  void _tickDriverMovement() {
    final from = _driverAnimationFrom;
    final to = _driverAnimationTo;
    if (from == null || to == null || !mounted) return;

    final t = Curves.easeInOutCubic.transform(
      _driverMoveController.value,
    );
    final latitude =
        from.latitude + (to.latitude - from.latitude) * t;
    final longitude =
        from.longitude + (to.longitude - from.longitude) * t;
    final bearingDelta =
        ((_driverBearing - _driverAnimationBearingFrom + 540) % 360) - 180;

    setState(() {
      _displayDriverPoint = domain.LatLng(latitude, longitude);
      _displayDriverBearing =
          (_driverAnimationBearingFrom + bearingDelta * t + 360) % 360;
    });
  }

  double _distanceMeters(domain.LatLng from, domain.LatLng to) {
    const earthRadius = 6371000.0;
    final lat1 = from.latitude * math.pi / 180;
    final lat2 = to.latitude * math.pi / 180;
    final deltaLat =
        (to.latitude - from.latitude) * math.pi / 180;
    final deltaLon =
        (to.longitude - from.longitude) * math.pi / 180;
    final a = math.sin(deltaLat / 2) * math.sin(deltaLat / 2) +
        math.cos(lat1) *
            math.cos(lat2) *
            math.sin(deltaLon / 2) *
            math.sin(deltaLon / 2);
    return earthRadius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  void _moveDriverSmoothly(
    domain.LatLng from,
    domain.LatLng to,
    double targetBearing,
  ) {
    final current = _displayDriverPoint ?? from;
    final distance = _distanceMeters(current, to);
    _driverBearing = targetBearing;

    if (distance > 2500) {
      _driverMoveController.stop();
      setState(() {
        _displayDriverPoint = to;
        _displayDriverBearing = targetBearing;
      });
      return;
    }

    _driverAnimationFrom = current;
    _driverAnimationTo = to;
    _driverAnimationBearingFrom = _displayDriverBearing;
    _driverMoveController.forward(from: 0);
  }

  Future<void> _loadMarkerIcons() async {
    final passengerIcon = await buildRamoMapMarker(
      icon: Icons.person_rounded,
      assetName: RamoMapMarkerAssets.passenger,
      background: const Color(0xFFFFFFFF),
      foreground: const Color(0xFF111111),
      border: const Color(0xFFFFC400),
      logicalSize: 58,
    );
    final destinationIcon = await buildRamoMapMarker(
      icon: Icons.flag_rounded,
      background: const Color(0xFF111111),
      foreground: const Color(0xFFFFFFFF),
      border: const Color(0xFFFFFFFF),
    );

    final vehicleIcons = <String, gm.BitmapDescriptor>{};
    for (final category in const [
      'moto',
      'car',
      'buggy',
      'comfort_black',
      'delivery',
    ]) {
      vehicleIcons[category] = await buildRamoMapMarker(
        icon: ramoVehicleIcon(category),
        assetName: ramoVehicleMarkerAsset(category),
        logicalSize: 62,
      );
    }

    if (!mounted) return;
    setState(() {
      _passengerIcon = passengerIcon;
      _destinationIcon = destinationIcon;
      _vehicleIcons
        ..clear()
        ..addAll(vehicleIcons);
    });
  }

  double _bearingBetween(domain.LatLng from, domain.LatLng to) {
    final lat1 = from.latitude * math.pi / 180;
    final lat2 = to.latitude * math.pi / 180;
    final dLon = (to.longitude - from.longitude) * math.pi / 180;
    final y = math.sin(dLon) * math.cos(lat2);
    final x = math.cos(lat1) * math.sin(lat2) -
        math.sin(lat1) * math.cos(lat2) * math.cos(dLon);
    final degrees = math.atan2(y, x) * 180 / math.pi;
    return (degrees + 360) % 360;
  }

  String _currentVehicleCategory() {
    final activeCategory = widget.activeRide?.category;
    if (activeCategory != null && activeCategory.isNotEmpty) {
      return activeCategory;
    }
    final categories = widget.supply?.categories ?? const <String>[];
    return categories.isEmpty ? 'car' : categories.first;
  }

  gm.BitmapDescriptor _vehicleIcon(String? category) {
    return _vehicleIcons[category] ??
        _vehicleIcons['car'] ??
        gm.BitmapDescriptor.defaultMarker;
  }

  @override
  void didUpdateWidget(covariant DriverLiveMap oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.detach();
      final native = _nativeController;
      if (native != null) widget.controller.attach(native);
    }

    if (oldWidget.networkTilesEnabled != widget.networkTilesEnabled) {
      _notifyPlaceholderReadyIfNeeded();
    }

    if (!_sameRoute(oldWidget.route, widget.route)) {
      if ((widget.route?.points.length ?? 0) < 2) {
        _routeDrawController.stop();
        _routeDrawController.value = 0;
      } else {
        _routeDrawController.forward(from: 0);
      }
    }

    final previousSupply = oldWidget.supply;
    final nextSupply = widget.supply;
    if (nextSupply == null) {
      _driverMoveController.stop();
      _displayDriverPoint = null;
    } else if (previousSupply == null) {
      _driverMoveController.stop();
      _displayDriverPoint =
          domain.LatLng(nextSupply.latitude, nextSupply.longitude);
    } else if (previousSupply.latitude != nextSupply.latitude ||
        previousSupply.longitude != nextSupply.longitude) {
      final from = domain.LatLng(
        previousSupply.latitude,
        previousSupply.longitude,
      );
      final to = domain.LatLng(
        nextSupply.latitude,
        nextSupply.longitude,
      );
      _moveDriverSmoothly(from, to, _bearingBetween(from, to));
    }
  }

  void _notifyPlaceholderReadyIfNeeded() {
    if (widget.networkTilesEnabled || _placeholderReadyNotified) return;
    _placeholderReadyNotified = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      widget.onMapReady?.call();
    });
  }

  void _onMapCreated(gm.GoogleMapController controller) {
    _nativeController = controller;
    widget.controller.attach(controller);
    widget.onMapReady?.call();
  }

  Set<gm.Marker> get _markers {
    final markers = <gm.Marker>{};

    for (var index = 0; index < widget.nearbyDrivers.length; index += 1) {
      final driver = widget.nearbyDrivers[index];
      markers.add(
        gm.Marker(
          markerId: gm.MarkerId(
            driver.driverId.isEmpty
                ? 'nearby-driver-$index'
                : 'nearby-driver-${driver.driverId}',
          ),
          position: gm.LatLng(driver.latitude, driver.longitude),
          icon: _vehicleIcon(driver.category),
          anchor: const Offset(.5, .5),
          flat: true,
          infoWindow: gm.InfoWindow(
            title: driver.busy ? 'Motorista ocupado' : 'Motorista disponível',
          ),
        ),
      );
    }

    final driverPoint = _driverPoint;
    markers.add(
      gm.Marker(
        markerId: const gm.MarkerId('current-driver'),
        position: gm.LatLng(
          driverPoint.latitude,
          driverPoint.longitude,
        ),
        icon: _vehicleIcon(_currentVehicleCategory()),
        anchor: const Offset(.5, .5),
        flat: true,
        rotation: _displayDriverBearing,
        infoWindow: const gm.InfoWindow(
          title: 'Você',
        ),
      ),
    );

    final ride = widget.activeRide;
    if (ride?.pickupLatitude != null && ride?.pickupLongitude != null) {
      markers.add(
        gm.Marker(
          markerId: const gm.MarkerId('pickup'),
          position: gm.LatLng(
            ride!.pickupLatitude!,
            ride.pickupLongitude!,
          ),
          icon: _passengerIcon,
          anchor: const Offset(.5, .5),
          infoWindow: const gm.InfoWindow(
            title: 'Embarque',
          ),
        ),
      );
    }

    if (ride?.dropoffLatitude != null && ride?.dropoffLongitude != null) {
      markers.add(
        gm.Marker(
          markerId: const gm.MarkerId('dropoff'),
          position: gm.LatLng(
            ride!.dropoffLatitude!,
            ride.dropoffLongitude!,
          ),
          icon: _destinationIcon,
          anchor: const Offset(.5, .5),
          infoWindow: const gm.InfoWindow(
            title: 'Destino',
          ),
        ),
      );
    }

    return markers;
  }

  Set<gm.Polyline> get _polylines {
    final route = widget.route;
    if (route == null || route.points.length < 2) return const {};
    final visiblePoints = driverVisibleRoutePoints(
      route.points,
      Curves.easeOutCubic.transform(_routeDrawController.value),
    );

    return {
      gm.Polyline(
        polylineId: const gm.PolylineId('driver-route'),
        points: visiblePoints
            .map(
              (point) => gm.LatLng(
                point.latitude,
                point.longitude,
              ),
            )
            .toList(growable: false),
        color: const Color(0xFF111111),
        width: 7,
        geodesic: false,
      ),
    };
  }

  @override
  void dispose() {
    _driverMoveController.dispose();
    _routeDrawController.dispose();
    widget.controller.detach();
    _nativeController = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.networkTilesEnabled) {
      return ColoredBox(
        color: Theme.of(context).colorScheme.surfaceContainerLowest,
      );
    }

    final driverPoint = _driverPoint;
    return gm.GoogleMap(
      initialCameraPosition: gm.CameraPosition(
        target: gm.LatLng(
          driverPoint.latitude,
          driverPoint.longitude,
        ),
        zoom: DriverMapConfig.fallbackZoom,
      ),
      onMapCreated: _onMapCreated,
      onCameraMove: widget.controller.updateCamera,
      markers: _markers,
      polylines: _polylines,
      minMaxZoomPreference: const gm.MinMaxZoomPreference(4, 19),
      compassEnabled: false,
      zoomControlsEnabled: false,
      mapToolbarEnabled: false,
      myLocationEnabled: false,
      myLocationButtonEnabled: false,
      rotateGesturesEnabled: true,
      tiltGesturesEnabled: false,
      buildingsEnabled: true,
      indoorViewEnabled: false,
      trafficEnabled: widget.navigationMode,
    );
  }
}
