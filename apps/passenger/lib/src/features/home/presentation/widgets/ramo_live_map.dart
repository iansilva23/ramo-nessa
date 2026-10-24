import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart' as domain;
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../../core/config/ramo_map_config.dart';
import '../../../../core/map/ramo_map_marker_icons.dart';
import '../../../map/domain/ramo_place.dart';
import '../../data/passenger_nearby_service.dart';

@visibleForTesting
List<domain.LatLng> ramoVisibleRoutePoints(
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
  final partial = domain.LatLng(
    from.latitude + (to.latitude - from.latitude) * segmentProgress,
    from.longitude + (to.longitude - from.longitude) * segmentProgress,
  );
  return [
    ...points.take(segment + 1),
    partial,
  ];
}

/// Repeat the reveal animation for a new route/stage, not for every
/// background location refresh while the passenger is tracking a driver.
@visibleForTesting
bool ramoShouldRevealRoute({
  required int previousPointCount,
  required int nextPointCount,
  required String? previousPhase,
  required String? nextPhase,
}) => nextPointCount >= 2 &&
    (previousPointCount < 2 || nextPhase == null || previousPhase != nextPhase);

class RamoMapController {
  gm.GoogleMapController? _nativeController;
  bool _disposed = false;
  int _cameraRequestId = 0;
  Size _viewport = Size.zero;
  EdgeInsets _viewportPadding = EdgeInsets.zero;

  void updateViewport(Size size, EdgeInsets padding) {
    _viewport = size;
    _viewportPadding = padding;
  }

  bool get ready => !_disposed && _nativeController != null;

  void attach(gm.GoogleMapController controller) {
    if (_disposed) return;
    _cameraRequestId++;
    _nativeController = controller;
  }

  void detach() {
    _cameraRequestId++;
    _nativeController = null;
  }

  Future<void> move(domain.LatLng point, double zoom) async {
    final controller = _nativeController;
    if (!ready || controller == null) return;
    _cameraRequestId++;

    await controller.animateCamera(
      gm.CameraUpdate.newLatLngZoom(
        gm.LatLng(point.latitude, point.longitude),
        zoom,
      ),
    );
  }

  Future<void> fitCoordinates({
    required List<domain.LatLng> coordinates,
    double edgePadding = 24,
    double maxZoom = 17,
  }) async {
    final controller = _nativeController;
    if (!ready || controller == null || coordinates.isEmpty) return;

    if (kIsWeb) {
      final fit = RamoMapCameraFit.calculate(
        points: coordinates.map((p) => RamoMapPoint(p.latitude, p.longitude)).toList(),
        viewport: _viewport,
        padding: _viewportPadding,
        edgePadding: edgePadding,
        maxZoom: maxZoom,
      );
      if (fit == null) return;
      _cameraRequestId++;
      // One complete target. Never read a stale zoom after Web fitBounds.
      await controller.moveCamera(gm.CameraUpdate.newLatLngZoom(
        gm.LatLng(fit.center.latitude, fit.center.longitude), fit.zoom,
      ));
      return;
    }
    if (!RamoMapConfig.hasRouteBounds(coordinates)) {
      // A zero-length route must not be passed to newLatLngBounds: native
      // map SDKs can yield an unstable zoom for identical endpoints.
      await move(coordinates.first, maxZoom);
      return;
    }

    final cameraRequestId = ++_cameraRequestId;
    var minLatitude = coordinates.first.latitude;
    var maxLatitude = coordinates.first.latitude;
    var minLongitude = coordinates.first.longitude;
    var maxLongitude = coordinates.first.longitude;

    for (final point in coordinates.skip(1)) {
      minLatitude =
          point.latitude < minLatitude ? point.latitude : minLatitude;
      maxLatitude =
          point.latitude > maxLatitude ? point.latitude : maxLatitude;
      minLongitude =
          point.longitude < minLongitude ? point.longitude : minLongitude;
      maxLongitude =
          point.longitude > maxLongitude ? point.longitude : maxLongitude;
    }

    // Screen overlays are handled by GoogleMap.padding per edge. Only a
    // small marker margin belongs in the symmetric bounds padding.
    final boundsUpdate = gm.CameraUpdate.newLatLngBounds(
      gm.LatLngBounds(
        southwest: gm.LatLng(minLatitude, minLongitude),
        northeast: gm.LatLng(maxLatitude, maxLongitude),
      ),
      edgePadding,
    );
    // Keep the existing native SDK bounds and animation behavior.
    await controller.animateCamera(boundsUpdate);

    // A newer location/route may have replaced this camera movement.
    if (!ready || controller != _nativeController ||
        cameraRequestId != _cameraRequestId) {
      return;
    }
    final currentZoom = await controller.getZoomLevel();
    if (!ready || controller != _nativeController ||
        cameraRequestId != _cameraRequestId) {
      return;
    }
    if (currentZoom > maxZoom) {
      final zoomUpdate = gm.CameraUpdate.zoomTo(maxZoom);
      await controller.animateCamera(zoomUpdate);
    }
  }

  void dispose() {
    _disposed = true;
    detach();
  }
}

class RamoLiveMap extends StatefulWidget {
  const RamoLiveMap({
    super.key,
    required this.controller,
    required this.origin,
    required this.destination,
    required this.routePoints,
    this.routePhase,
    this.driverPosition,
    this.driverCategory,
    this.driverPositionStale = false,
    this.onMapReady,
    this.networkTilesEnabled = true,
    this.cameraPadding = EdgeInsets.zero,
    this.nearbyVehicles = const [],
  });

  final RamoMapController controller;
  final RamoPlace? origin;
  final RamoPlace? destination;
  final List<domain.LatLng> routePoints;
  /// Optional tracking phase. Ordinary route searches retain their animation.
  final String? routePhase;
  final domain.LatLng? driverPosition;
  final String? driverCategory;
  final bool driverPositionStale;
  final VoidCallback? onMapReady;
  final bool networkTilesEnabled;
  final EdgeInsets cameraPadding;
  final List<PassengerNearbyVehicle> nearbyVehicles;

  @override
  State<RamoLiveMap> createState() => _RamoLiveMapState();
}

class _RamoLiveMapState extends State<RamoLiveMap>
    with TickerProviderStateMixin {
  gm.GoogleMapController? _nativeController;
  bool _placeholderReadyNotified = false;
  double _displayDriverBearing = 0;
  domain.LatLng? _displayDriverPosition;
  RamoRouteMotionPath? _driverMotionPath;
  late final AnimationController _driverMoveController;
  late final AnimationController _routeDrawController;
  late final AnimationController _nearbyMoveController;
  final Map<String,domain.LatLng> _nearbyPositions = {};
  final Map<String,domain.LatLng> _nearbyFrom = {};
  final Map<String,domain.LatLng> _nearbyTo = {};
  final Map<String,double> _nearbyBearings = {};
  final Map<String,gm.BitmapDescriptor> _nearbyIcons = {};
  gm.BitmapDescriptor _passengerIcon =
      gm.BitmapDescriptor.defaultMarker;
  gm.BitmapDescriptor _destinationIcon =
      gm.BitmapDescriptor.defaultMarker;
  gm.BitmapDescriptor _driverIcon =
      gm.BitmapDescriptor.defaultMarker;
  gm.BitmapDescriptor _staleDriverIcon =
      gm.BitmapDescriptor.defaultMarker;

  @override
  void initState() {
    super.initState();
    _nearbyMoveController = AnimationController(vsync:this,duration:const Duration(milliseconds:1500))..addListener(_tickNearbyMovement);
    _syncNearbyVehicles();
    _loadNearbyIcons();
    _displayDriverPosition = widget.driverPosition;
    _driverMoveController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 720),
    )..addListener(_tickDriverMovement);
    _routeDrawController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 950),
    )..addListener(_tickRouteDrawing);
    if (widget.routePoints.length >= 2) {
      _routeDrawController.forward(from: 0);
    }
    _notifyPlaceholderReadyIfNeeded();
    _loadMarkerIcons();
  }

  void _tickRouteDrawing() {
    if (mounted) setState(() {});
  }

  Future<void> _loadNearbyIcons() async {
    final icons = <String,gm.BitmapDescriptor>{};
    for (final category in ['moto','car','buggy','delivery','comfort_black']) {
      icons[category] = await buildRamoMapMarker(icon:ramoVehicleIcon(category),assetName:ramoVehicleMarkerAsset(category),logicalSize:54);
    }
    if (mounted) setState(() => _nearbyIcons.addAll(icons));
  }

  void _syncNearbyVehicles() {
    _nearbyMoveController.stop();
    final ids = widget.nearbyVehicles.map((v) => v.id).toSet();
    _nearbyPositions.removeWhere((id,_) => !ids.contains(id));
    _nearbyBearings.removeWhere((id,_) => !ids.contains(id));
    _nearbyFrom.clear(); _nearbyTo.clear();
    for (final vehicle in widget.nearbyVehicles) {
      final from = _nearbyPositions[vehicle.id];
      if (from == null || _distanceMeters(from, vehicle.position) > 1000) {
        _nearbyPositions[vehicle.id] = vehicle.position;
      } else if (from.latitude != vehicle.position.latitude || from.longitude != vehicle.position.longitude) {
        _nearbyFrom[vehicle.id] = from;
        _nearbyTo[vehicle.id] = vehicle.position;
        _nearbyBearings[vehicle.id] = _bearingBetween(from, vehicle.position);
      }
    }
    if (_nearbyTo.isNotEmpty) _nearbyMoveController.forward(from:0);
  }

  void _tickNearbyMovement() {
    if (!mounted) return;
    final t = Curves.easeInOut.transform(_nearbyMoveController.value);
    setState(() {
      for (final entry in _nearbyTo.entries) {
        final from = _nearbyFrom[entry.key]!, to = entry.value;
        _nearbyPositions[entry.key] = domain.LatLng(from.latitude+(to.latitude-from.latitude)*t,from.longitude+(to.longitude-from.longitude)*t);
      }
    });
  }

  bool _sameRoute(
    List<domain.LatLng> previous,
    List<domain.LatLng> next,
  ) {
    if (previous.length != next.length) return false;
    for (var index = 0; index < previous.length; index += 1) {
      if (previous[index].latitude != next[index].latitude ||
          previous[index].longitude != next[index].longitude) {
        return false;
      }
    }
    return true;
  }

  void _tickDriverMovement() {
    final path = _driverMotionPath;
    if (path == null || !mounted) return;
    final t = Curves.easeInOutCubic.transform(
      _driverMoveController.value,
    );
    final sample = path.sample(t);
    setState(() {
      _displayDriverPosition = domain.LatLng(
        sample.point.latitude,
        sample.point.longitude,
      );
      _displayDriverBearing = sample.bearing;
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
  ) {
    final current = _displayDriverPosition ?? from;
    final distance = _distanceMeters(current, to);

    if (widget.driverPositionStale || distance > 2500) {
      _driverMoveController.stop();
      setState(() {
        _displayDriverPosition = to;
        _displayDriverBearing = _bearingBetween(current, to);
      });
      return;
    }

    _driverMotionPath = RamoRouteMotionPath.between(
      from: RamoMapPoint(current.latitude, current.longitude),
      to: RamoMapPoint(to.latitude, to.longitude),
      route: widget.routePoints
          .map((point) => RamoMapPoint(point.latitude, point.longitude))
          .toList(growable: false),
    );
    _driverMoveController.duration = Duration(
      milliseconds:
          ((_driverMotionPath!.totalMeters / 8) * 1000)
              .round()
              .clamp(900, 6000)
              .toInt(),
    );
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
      assetName: RamoMapMarkerAssets.destination,
      background: const Color(0xFF111111),
      foreground: const Color(0xFFFFFFFF),
      border: const Color(0xFFFFFFFF),
    );
    final driverIcon = await buildRamoMapMarker(
      icon: ramoVehicleIcon(widget.driverCategory),
      assetName: ramoVehicleMarkerAsset(widget.driverCategory),
      logicalSize: 62,
    );
    final staleDriverIcon = await buildRamoMapMarker(
      icon: ramoVehicleIcon(widget.driverCategory),
      assetName: ramoVehicleMarkerAsset(widget.driverCategory),
      background: const Color(0xFFB23A3A),
      foreground: const Color(0xFFFFFFFF),
      logicalSize: 62,
    );
    if (!mounted) return;
    setState(() {
      _passengerIcon = passengerIcon;
      _destinationIcon = destinationIcon;
      _driverIcon = driverIcon;
      _staleDriverIcon = staleDriverIcon;
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

  @override
  void didUpdateWidget(covariant RamoLiveMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.nearbyVehicles,widget.nearbyVehicles)) _syncNearbyVehicles();

    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.detach();
      final native = _nativeController;
      if (native != null) widget.controller.attach(native);
    }

    if (oldWidget.networkTilesEnabled != widget.networkTilesEnabled) {
      _notifyPlaceholderReadyIfNeeded();
    }

    if (!_sameRoute(oldWidget.routePoints, widget.routePoints) ||
        oldWidget.routePhase != widget.routePhase) {
      if (widget.routePoints.length < 2) {
        _routeDrawController.stop();
        _routeDrawController.value = 0;
      } else if (ramoShouldRevealRoute(
        previousPointCount: oldWidget.routePoints.length,
        nextPointCount: widget.routePoints.length,
        previousPhase: oldWidget.routePhase,
        nextPhase: widget.routePhase,
      )) {
        _routeDrawController.forward(from: 0);
      } else {
        // GPS/reroute changed shape inside the same ride stage: show it
        // immediately instead of replaying the 950 ms reveal animation.
        _routeDrawController.value = 1;
      }
    }

    final previousDriver = oldWidget.driverPosition;
    final nextDriver = widget.driverPosition;
    if (nextDriver == null) {
      _driverMoveController.stop();
      _displayDriverPosition = null;
    } else if (previousDriver == null) {
      _driverMoveController.stop();
      _displayDriverPosition = nextDriver;
    } else if (previousDriver.latitude != nextDriver.latitude ||
        previousDriver.longitude != nextDriver.longitude) {
      _moveDriverSmoothly(
        previousDriver,
        nextDriver,
      );
    }

    if (oldWidget.driverCategory != widget.driverCategory) {
      _loadMarkerIcons();
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
    for (final vehicle in widget.nearbyVehicles) {
      final icon = _nearbyIcons[vehicle.category];
      if (icon == null) continue;
      final position = _nearbyPositions[vehicle.id] ?? vehicle.position;
      markers.add(gm.Marker(
        markerId:gm.MarkerId('nearby-${vehicle.id}'),
        position:gm.LatLng(position.latitude,position.longitude),icon:icon,
        anchor:const Offset(.5,.5),flat:true,rotation:_nearbyBearings[vehicle.id] ?? 0,
        consumeTapEvents:true,
      ));
    }

    final origin = widget.origin;
    if (origin != null) {
      markers.add(
        gm.Marker(
          markerId: const gm.MarkerId('origin'),
          position: gm.LatLng(
            origin.position.latitude,
            origin.position.longitude,
          ),
          icon: _passengerIcon,
          anchor: const Offset(.5, .5),
          infoWindow: gm.InfoWindow(
            title: 'Embarque',
            snippet: origin.name,
          ),
        ),
      );
    }

    final destination = widget.destination;
    if (destination != null) {
      markers.add(
        gm.Marker(
          markerId: const gm.MarkerId('destination'),
          position: gm.LatLng(
            destination.position.latitude,
            destination.position.longitude,
          ),
          icon: _destinationIcon,
          // A ponta inferior do pino 3D deve coincidir com o destino real.
          anchor: const Offset(.5, .91),
          infoWindow: gm.InfoWindow(
            title: 'Destino',
            snippet: destination.name,
          ),
        ),
      );
    }

    final driver = _displayDriverPosition ?? widget.driverPosition;
    if (driver != null) {
      markers.add(
        gm.Marker(
          markerId: const gm.MarkerId('driver'),
          position: gm.LatLng(driver.latitude, driver.longitude),
          icon: widget.driverPositionStale
              ? _staleDriverIcon
              : _driverIcon,
          anchor: const Offset(.5, .5),
          flat: true,
          rotation: _displayDriverBearing,
          infoWindow: gm.InfoWindow(
            title: widget.driverPositionStale
                ? 'Última posição do motorista'
                : 'Seu motorista',
          ),
        ),
      );
    }

    return markers;
  }

  Set<gm.Polyline> get _polylines {
    if (widget.routePoints.length < 2) return const {};
    final visiblePoints = ramoVisibleRoutePoints(
      widget.routePoints,
      Curves.easeOutCubic.transform(_routeDrawController.value),
    );

    return {
      gm.Polyline(
        polylineId: const gm.PolylineId('ride-route'),
        points: visiblePoints
            .map(
              (point) => gm.LatLng(
                point.latitude,
                point.longitude,
              ),
            )
            .toList(growable: false),
        color: const Color(0xFF111111),
        width: 6,
        geodesic: false,
      ),
    };
  }

  @override
  void dispose() {
    _nearbyMoveController.dispose();
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

    return LayoutBuilder(builder: (context, constraints) {
      widget.controller.updateViewport(constraints.biggest, widget.cameraPadding);
      return gm.GoogleMap(
          // Full-screen app maps must accept the first one-finger drag.
          // Leaving this automatic can select cooperative (two-finger) mode.
          webGestureHandling: kIsWeb ? gm.WebGestureHandling.greedy : null,
      style: Theme.of(context).brightness == Brightness.dark
          ? ramoDarkMapStyle
          : ramoLightMapStyle,
      initialCameraPosition: gm.CameraPosition(
        target: gm.LatLng(
          widget.origin?.position.latitude ?? RamoMapConfig.fallbackCenter.latitude,
          widget.origin?.position.longitude ?? RamoMapConfig.fallbackCenter.longitude,
        ),
        zoom: widget.origin == null
            ? RamoMapConfig.fallbackZoom
            : RamoMapConfig.locationZoom,
      ),
      padding: widget.cameraPadding,
      onMapCreated: _onMapCreated,
      markers: _markers,
      polylines: _polylines,
      minMaxZoomPreference: const gm.MinMaxZoomPreference(4, 19),
      compassEnabled: false,
      webCameraControlEnabled: false,
      zoomControlsEnabled: false,
      mapToolbarEnabled: false,
      myLocationEnabled: false,
      myLocationButtonEnabled: false,
      rotateGesturesEnabled: true,
      tiltGesturesEnabled: false,
      buildingsEnabled: true,
      indoorViewEnabled: false,
      trafficEnabled: false,
      );
    });
  }
}

