import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart' as domain;
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../../core/config/driver_map_config.dart';
import '../../../../core/config/driver_web_heading_config.dart';
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
  Size _viewport = Size.zero;
  // Camera-only driving mode for Android/iOS. Web behaviour is untouched.
  final ValueNotifier<bool> followPaused = ValueNotifier<bool>(false);
  final ValueNotifier<double> webHeading = ValueNotifier<double>(0);
  bool _nativeNavigationActive = false;
  bool _webNavigationActive = false;
  DateTime _webCameraUntil = DateTime.fromMillisecondsSinceEpoch(0);
  int _nativeMapTouches = 0;
  domain.LatLng? _lastCoursePoint;
  double? _lastCourseBearing;

  void updateViewport(Size size) {
    _viewport = size;
  }

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

  void onMapPointerDown() {
    if ((!kIsWeb && _nativeNavigationActive) ||
        (DriverWebHeadingConfig.hasVectorMap && _webNavigationActive)) {
      _nativeMapTouches++;
    }
  }

  void onMapPointerUp() {
    if (_nativeMapTouches > 0) _nativeMapTouches--;
  }

  void onCameraMoveStarted() {
    if (kIsWeb) {
      if (!DriverWebHeadingConfig.hasVectorMap || !_webNavigationActive) return;
      // HtmlElementView can consume pointer events before Flutter gets them.
      // The camera update window separates GPS-driven moves from user pans.
      if (_nativeMapTouches == 0 && DateTime.now().isBefore(_webCameraUntil)) {
        return;
      }
      followPaused.value = true;
      return;
    }
    if (!_nativeNavigationActive || _nativeMapTouches == 0) return;
    followPaused.value = true;
  }

  void resumeNativeFollow() {
    if (kIsWeb && !DriverWebHeadingConfig.hasVectorMap) return;
    followPaused.value = false;
  }

  Future<void> _changeNativeCamera(gm.CameraPosition position) async {
    final controller = _nativeController;
    if (kIsWeb || !ready || controller == null) return;
    try {
      await controller.animateCamera(
        gm.CameraUpdate.newCameraPosition(position),
      );
    } catch (error) {
      // The native map can be destroyed mid-animation on a tab change or
      // app background transition. Keep the trip and route functioning.
      debugPrint('Motorista GPS 3D: movimentação da câmera indisponível: $error');
    }
  }

  Future<void> followNavigation(
    domain.LatLng point, {
    List<domain.LatLng> route = const [],
  }) async {
    if (kIsWeb) {
      if (!DriverWebHeadingConfig.hasVectorMap) {
        return move(point, DriverMapConfig.navigationZoom);
      }
      _webNavigationActive = true;
    } else {
      _nativeNavigationActive = true;
    }

    final from = _lastCoursePoint;
    final course =
        from == null ? null : DriverMapConfig.courseFromMovement(from, point);
    if (from == null ||
        DriverMapConfig.distanceMeters(from, point) >=
            DriverMapConfig.headingMinTravelMeters) {
      _lastCoursePoint = point;
    }
    if (course != null) {
      _lastCourseBearing = _lastCourseBearing == null
          ? course
          : DriverMapConfig.smoothBearing(_lastCourseBearing!, course);
    } else {
      _lastCourseBearing ??= DriverMapConfig.routeBearing(point, route);
    }
    if (followPaused.value) return;
    _currentZoom = DriverMapConfig.navigationZoom;
    final heading = _lastCourseBearing ?? 0;
    if (kIsWeb) {
      webHeading.value = heading;
      final controller = _nativeController;
      if (!ready || controller == null) return;
      _webCameraUntil = DateTime.now().add(const Duration(milliseconds: 900));
      try {
        // Full-map heading on Google Maps VECTOR; no rotated DOM/vehicle fake.
        await controller.animateCamera(gm.CameraUpdate.newCameraPosition(
          gm.CameraPosition(
            target: gm.LatLng(point.latitude, point.longitude),
            zoom: DriverWebHeadingConfig.zoom,
            bearing: heading,
            tilt: DriverWebHeadingConfig.tilt,
          ),
        ));
      } catch (error) {
        debugPrint('GPS 2D Web: câmera indisponível: $error');
      }
      return;
    }
    await _changeNativeCamera(gm.CameraPosition(
      target: gm.LatLng(point.latitude, point.longitude),
      zoom: DriverMapConfig.navigationZoom,
      tilt: DriverMapConfig.navigationTilt,
      bearing: heading,
    ));
  }

  Future<void> stopNativeNavigation(domain.LatLng point) async {
    if (kIsWeb) return;
    if (!_nativeNavigationActive) return;
    _nativeNavigationActive = false;
    _nativeMapTouches = 0;
    _lastCoursePoint = null;
    _lastCourseBearing = null;
    followPaused.value = false;
    // Return to the familiar north-up map without changing the ride.
    _currentZoom = DriverMapConfig.recenterMinimumZoom;
    await _changeNativeCamera(gm.CameraPosition(
      target: gm.LatLng(point.latitude, point.longitude),
      zoom: DriverMapConfig.recenterMinimumZoom,
    ));
  }

  Future<void> stopWebNavigation(domain.LatLng point) async {
    if (!kIsWeb || !DriverWebHeadingConfig.hasVectorMap ||
        !_webNavigationActive) return;
    _webNavigationActive = false;
    _nativeMapTouches = 0;
    _lastCoursePoint = null;
    _lastCourseBearing = null;
    followPaused.value = false;
    webHeading.value = 0;
    final controller = _nativeController;
    if (!ready || controller == null) return;
    _webCameraUntil = DateTime.now().add(const Duration(milliseconds: 900));
    try {
      await controller.animateCamera(gm.CameraUpdate.newCameraPosition(
        gm.CameraPosition(
          target: gm.LatLng(point.latitude, point.longitude),
          zoom: DriverMapConfig.recenterMinimumZoom,
          tilt: 0,
          bearing: 0,
        ),
      ));
    } catch (error) {
      debugPrint('GPS 2D Web: retorno ao mapa normal: $error');
    }
  }

  void resetNavigationForNewMap() {
    if (kIsWeb) {
      _webNavigationActive = false;
      _nativeMapTouches = 0;
      _lastCoursePoint = null;
      _lastCourseBearing = null;
      followPaused.value = false;
      webHeading.value = 0;
      return;
    }
    _nativeNavigationActive = false;
    _nativeMapTouches = 0;
    _lastCoursePoint = null;
    _lastCourseBearing = null;
    followPaused.value = false;
  }

  Future<void> move(domain.LatLng point, [double? zoom]) async {
    final controller = _nativeController;
    if (!ready || controller == null) return;

    final targetZoom = zoom ?? _currentZoom;
    _currentZoom = targetZoom;

    if (!kIsWeb) {
      await _changeNativeCamera(gm.CameraPosition(
        target: gm.LatLng(point.latitude, point.longitude),
        zoom: targetZoom,
      ));
    } else {
      await controller.animateCamera(
        gm.CameraUpdate.newLatLngZoom(
          gm.LatLng(point.latitude, point.longitude),
          targetZoom,
        ),
      );
    }
  }

  Future<void> fitCoordinates(
    List<domain.LatLng> coordinates, {
    double padding = 90,
    double maxZoom = 16.5,
    bool animate = true,
  }) async {
    final controller = _nativeController;
    if (!ready || controller == null || coordinates.isEmpty) return;
    if (kIsWeb) {
      final fit = RamoMapCameraFit.calculate(
        points: coordinates.map((p) => RamoMapPoint(p.latitude, p.longitude)).toList(),
        viewport: _viewport,
        edgePadding: padding,
        maxZoom: maxZoom,
      );
      if (fit == null) return;
      _currentZoom = fit.zoom;
      await controller.moveCamera(gm.CameraUpdate.newLatLngZoom(
        gm.LatLng(fit.center.latitude, fit.center.longitude), fit.zoom,
      ));
      return;
    }
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

    final update = gm.CameraUpdate.newLatLngBounds(
      gm.LatLngBounds(
        southwest: gm.LatLng(minLatitude, minLongitude),
        northeast: gm.LatLng(maxLatitude, maxLongitude),
      ),
      padding,
    );
    if (animate) {
      await controller.animateCamera(update);
    } else {
      await controller.moveCamera(update);
    }
    final currentZoom = await controller.getZoomLevel();
    if (currentZoom > maxZoom) {
      if (animate) {
        await controller.animateCamera(gm.CameraUpdate.zoomTo(maxZoom));
      } else {
        await controller.moveCamera(gm.CameraUpdate.zoomTo(maxZoom));
      }
    }
  }

  void dispose() {
    _disposed = true;
    detach();
    followPaused.dispose();
    webHeading.dispose();
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
  double _displayDriverBearing = 0;
  domain.LatLng? _displayDriverPoint;
  RamoRouteMotionPath? _driverMotionPath;
  late final AnimationController _driverMoveController;
  late final AnimationController _routeDrawController;
  gm.BitmapDescriptor _passengerIcon = gm.BitmapDescriptor.defaultMarker;
  gm.BitmapDescriptor _destinationIcon = gm.BitmapDescriptor.defaultMarker;
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
      _displayDriverPoint = domain.LatLng(supply.latitude, supply.longitude);
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
    final path = _driverMotionPath;
    if (path == null || !mounted) return;
    final t = Curves.easeInOutCubic.transform(_driverMoveController.value);
    final sample = path.sample(t);
    setState(() {
      _displayDriverPoint = domain.LatLng(
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
    final deltaLat = (to.latitude - from.latitude) * math.pi / 180;
    final deltaLon = (to.longitude - from.longitude) * math.pi / 180;
    final a =
        math.sin(deltaLat / 2) * math.sin(deltaLat / 2) +
        math.cos(lat1) *
            math.cos(lat2) *
            math.sin(deltaLon / 2) *
            math.sin(deltaLon / 2);
    return earthRadius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  void _moveDriverSmoothly(domain.LatLng from, domain.LatLng to) {
    final current = _displayDriverPoint ?? from;
    final distance = _distanceMeters(current, to);

    if (distance > 2500) {
      _driverMoveController.stop();
      setState(() {
        _displayDriverPoint = to;
        _displayDriverBearing = _bearingBetween(current, to);
      });
      return;
    }

    _driverMotionPath = RamoRouteMotionPath.between(
      from: RamoMapPoint(current.latitude, current.longitude),
      to: RamoMapPoint(to.latitude, to.longitude),
      route: (widget.route?.points ?? const <domain.LatLng>[])
          .map((point) => RamoMapPoint(point.latitude, point.longitude))
          .toList(growable: false),
    );
    _driverMoveController.duration = Duration(
      milliseconds: ((_driverMotionPath!.totalMeters / 8) * 1000)
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
    final x =
        math.cos(lat1) * math.sin(lat2) -
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

    if (oldWidget.navigationMode && !widget.navigationMode) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || widget.navigationMode) return;
        if (kIsWeb) {
          unawaited(widget.controller.stopWebNavigation(_driverPoint));
        } else {
          unawaited(widget.controller.stopNativeNavigation(_driverPoint));
        }
      });
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
      _displayDriverPoint = domain.LatLng(
        nextSupply.latitude,
        nextSupply.longitude,
      );
    } else if (previousSupply.latitude != nextSupply.latitude ||
        previousSupply.longitude != nextSupply.longitude) {
      final from = domain.LatLng(
        previousSupply.latitude,
        previousSupply.longitude,
      );
      final to = domain.LatLng(nextSupply.latitude, nextSupply.longitude);
      _moveDriverSmoothly(from, to);
    }
  }

  void _notifyPlaceholderReadyIfNeeded() {
    if (widget.networkTilesEnabled || _placeholderReadyNotified) return;
    _placeholderReadyNotified = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _notifyMapReady();
    });
  }

  void _notifyMapReady() {
    widget.onMapReady?.call();
    final route = widget.route;
    if (kIsWeb && route != null && route.points.length >= 2) {
      // A route can arrive before tiles are ready, or survive a tab change
      // which recreates the map. Do not leave the driver framed on GPS only.
      unawaited(widget.controller.fitCoordinates(
        route.points,
        padding: DriverMapConfig.routeEdgePadding(MediaQuery.sizeOf(context).width),
      ).catchError((Object _) {
        // Keep the route line and controls available if the SDK is not ready.
      }));
    }
  }

  void _onMapCreated(gm.GoogleMapController controller) {
    _nativeController = controller;
    widget.controller.attach(controller);
    if (!widget.navigationMode) {
      widget.controller.resetNavigationForNewMap();
    }
    _notifyMapReady();
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
        position: gm.LatLng(driverPoint.latitude, driverPoint.longitude),
        icon: _vehicleIcon(_currentVehicleCategory()),
        anchor: const Offset(.5, .5),
        flat: true,
        rotation: _displayDriverBearing,
        infoWindow: const gm.InfoWindow(title: 'Você'),
      ),
    );

    final ride = widget.activeRide;
    if (ride?.pickupLatitude != null && ride?.pickupLongitude != null) {
      markers.add(
        gm.Marker(
          markerId: const gm.MarkerId('pickup'),
          position: gm.LatLng(ride!.pickupLatitude!, ride.pickupLongitude!),
          icon: _passengerIcon,
          anchor: const Offset(.5, .5),
          infoWindow: const gm.InfoWindow(title: 'Embarque'),
        ),
      );
    }

    if (ride?.dropoffLatitude != null && ride?.dropoffLongitude != null) {
      markers.add(
        gm.Marker(
          markerId: const gm.MarkerId('dropoff'),
          position: gm.LatLng(ride!.dropoffLatitude!, ride.dropoffLongitude!),
          icon: _destinationIcon,
          // Alinhar a ponta do pino 3D às coordenadas da chegada.
          anchor: const Offset(.5, .91),
          infoWindow: const gm.InfoWindow(title: 'Destino'),
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
            .map((point) => gm.LatLng(point.latitude, point.longitude))
            .toList(growable: false),
        color: DriverWebHeadingConfig.hasVectorMap && widget.navigationMode
            ? const Color(0xFF168AF9)
            : const Color(0xFF111111),
        width: DriverWebHeadingConfig.hasVectorMap && widget.navigationMode
            ? 9 : 7,
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
    return LayoutBuilder(builder: (context, constraints) {
      widget.controller.updateViewport(constraints.biggest);
      return Listener(
        onPointerDown: (_) => widget.controller.onMapPointerDown(),
        onPointerUp: (_) => widget.controller.onMapPointerUp(),
        onPointerCancel: (_) => widget.controller.onMapPointerUp(),
        child: gm.GoogleMap(
          // Full-screen app maps must accept the first one-finger drag.
          // Leaving this automatic can select cooperative (two-finger) mode.
          webGestureHandling: kIsWeb ? gm.WebGestureHandling.greedy : null,
      // A vector Map ID ignores inline JSON styles. Configure equivalent
      // styling in Google Cloud before any eventual Web rollout.
      mapId: DriverWebHeadingConfig.hasVectorMap
          ? DriverWebHeadingConfig.vectorMapId
          : null,
      style: DriverWebHeadingConfig.hasVectorMap
          ? null
          : (Theme.of(context).brightness == Brightness.dark
              ? ramoDarkMapStyle
              : ramoLightMapStyle),
      initialCameraPosition: gm.CameraPosition(
        target: gm.LatLng(driverPoint.latitude, driverPoint.longitude),
        zoom: DriverMapConfig.fallbackZoom,
      ),
      onMapCreated: _onMapCreated,
      onCameraMove: widget.controller.updateCamera,
      onCameraMoveStarted: widget.controller.onCameraMoveStarted,
      markers: _markers,
      polylines: _polylines,
      minMaxZoomPreference: const gm.MinMaxZoomPreference(4, 19),
      compassEnabled: !kIsWeb && widget.navigationMode,
      zoomControlsEnabled: false,
      mapToolbarEnabled: false,
      myLocationEnabled: false,
      myLocationButtonEnabled: false,
      rotateGesturesEnabled: true,
      tiltGesturesEnabled: !kIsWeb && widget.navigationMode,
      buildingsEnabled: true,
      indoorViewEnabled: false,
      trafficEnabled: widget.navigationMode,
        ),
      );
    });
  }
}


