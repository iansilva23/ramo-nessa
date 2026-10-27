import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart' as domain;
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../../core/config/driver_map_config.dart';
import '../../../../core/config/driver_web_cinematic_camera.dart';
import '../../../../core/config/driver_web_heading_config.dart';
import '../../../../core/map/ramo_map_marker_icons.dart';
import '../../../../core/map/driver_map_gestures.dart';
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
  EdgeInsets _padding = EdgeInsets.zero;
  final ValueNotifier<bool> followPaused = ValueNotifier<bool>(false);
  final ValueNotifier<double> webHeading = ValueNotifier<double>(0);
  Timer? _resumeTimer;
  int _touches = 0, _generation = 0, _intent = 0;
  bool _writing = false;
  DateTime _automaticUntil = DateTime.fromMillisecondsSinceEpoch(0);
  gm.CameraPosition? _queued, _lastCamera;
  Future<void> Function()? _resumeAction;
  domain.LatLng? _lastCoursePoint;
  double? _lastCourseBearing, _navigationZoom;

  void updateViewport(Size size, [EdgeInsets padding = EdgeInsets.zero]) { _viewport = size; _padding = padding; }
  bool get ready => !_disposed && _nativeController != null;
  double get currentZoom => _currentZoom;
  void attach(gm.GoogleMapController controller) { if (!_disposed) _nativeController = controller; }
  void detach() {
    _generation++; _intent++; _resumeTimer?.cancel(); _resumeTimer = null;
    _queued = null; _resumeAction = null; _touches = 0;
    _nativeController = null;
  }
  void updateCamera(gm.CameraPosition position) {
    if (_disposed) return;
    _lastCamera = position;
    _currentZoom = position.zoom; webHeading.value = position.bearing;
    if (followPaused.value && _touches == 0) _scheduleResume();
  }
  void _pause() {
    if (_disposed) return;
    _resumeTimer?.cancel(); _queued = null;
    followPaused.value = true;
  }
  void onMapPointerDown() { _touches++; _pause(); }
  void onMapPointerMove() { if (_touches > 0) _pause(); }
  void onMapPointerUp() { if (_touches > 0) _touches--; if (_touches == 0) _scheduleResume(); }
  void onMapWheel() { _pause(); if (_touches == 0) _scheduleResume(); }
  void onCameraMoveStarted() {
    if (_touches > 0) { _pause(); return; }
    if (DateTime.now().isBefore(_automaticUntil)) return;
    // Fallback for platform-view gestures not delivered as Flutter pointers.
    _pause(); _scheduleResume();
  }
  void onCameraIdle() { if (followPaused.value && _touches == 0) _scheduleResume(); }
  void _scheduleResume() {
    _resumeTimer?.cancel();
    if (_disposed || !followPaused.value || _touches > 0) return;
    final generation = _generation;
    _resumeTimer = Timer(DriverMapConfig.gestureResumeDelay, () {
      if (_disposed || generation != _generation || !ready || _touches > 0) return;
      followPaused.value = false;
      final resume = _resumeAction;
      if (resume != null) unawaited(resume().catchError((Object e) { debugPrint('Retomada da câmera indisponível: $e'); }));
    });
  }
  void resumeNativeFollow() { _resumeTimer?.cancel(); if (!_disposed) followPaused.value = false; }

  /// Serializes SDK animations and coalesces GPS fixes. A gesture prevents any
  /// subsequent write; its resume action always uses the newest driver fix.
  Future<void> _animate(gm.CameraPosition position) async {
    _intent++;
    _resumeAction = () => _animate(position);
    if (!ready || followPaused.value) return;
    _queued = position;
    if (_writing) return;
    _writing = true;
    final generation = _generation, controller = _nativeController!;
    try {
      while (_queued != null && !followPaused.value && ready && generation == _generation) {
        var next = _queued!; _queued = null;
        if (kIsWeb) {
          final fit = RamoMapCameraFit.calculate(points: [RamoMapPoint(next.target.latitude,next.target.longitude)],
            viewport: _viewport, padding: _padding, edgePadding: 0, maxZoom: next.zoom);
          if (fit != null) next = gm.CameraPosition(target: gm.LatLng(fit.center.latitude,fit.center.longitude),zoom:next.zoom,tilt:next.tilt,bearing:next.bearing);
        }
        _lastCamera = next;
        _automaticUntil = DateTime.now().add(const Duration(seconds: 2));
        _currentZoom = next.zoom; webHeading.value = next.bearing;
        await controller.animateCamera(gm.CameraUpdate.newCameraPosition(next));
      }
    } catch (e) { debugPrint('Câmera do motorista indisponível: $e'); }
    finally {
      _writing = false;
      final pending = _queued;
      if (pending != null && ready && !followPaused.value) unawaited(_animate(pending));
    }
  }

  Future<void> zoomBy(double delta) async {
    final controller = _nativeController, last = _lastCamera;
    if (!ready || controller == null || last == null) return;
    onMapWheel();
    _automaticUntil = DateTime.now().add(const Duration(seconds: 2));
    try {
      _currentZoom = (_currentZoom + delta).clamp(4.0,19.0).toDouble();
      await controller.animateCamera(gm.CameraUpdate.newCameraPosition(gm.CameraPosition(
        target:last.target, zoom:_currentZoom, tilt:last.tilt, bearing:last.bearing)));
    } catch (e) { debugPrint('Zoom manual indisponível: $e'); }
  }

  Future<void> followNavigation(domain.LatLng point, {List<domain.LatLng> route = const []}) async {
    final from = _lastCoursePoint;
    final course = from == null ? null : DriverMapConfig.courseFromMovement(from, point);
    if (from == null || DriverMapConfig.distanceMeters(from, point) >= DriverMapConfig.headingMinTravelMeters) _lastCoursePoint = point;
    if (course != null) {
      _lastCourseBearing = _lastCourseBearing == null ? course : DriverMapConfig.smoothBearing(_lastCourseBearing!, course);
    } else { _lastCourseBearing ??= DriverMapConfig.routeBearing(point, route); }
    final desired = DriverMapConfig.navigationZoomFor(DriverMapConfig.remainingRouteMeters(point, route));
    _navigationZoom = _navigationZoom == null ? desired : _navigationZoom! + (desired - _navigationZoom!).clamp(-.15, .15);
    final heading = _lastCourseBearing ?? 0;
    final target = DriverWebCinematicCamera.lookAhead(point, heading, DriverWebCinematicCamera.lookAheadMeters);
    await _animate(gm.CameraPosition(target: gm.LatLng(target.latitude, target.longitude),
      zoom: _navigationZoom!, tilt: DriverMapConfig.navigationTilt, bearing: heading));
  }
  Future<void> enterWebDrivingPerspective(domain.LatLng point, {List<domain.LatLng> route = const []}) => followNavigation(point, route: route);
  Future<void> stopNativeNavigation(domain.LatLng point) { _lastCoursePoint = null; _lastCourseBearing = null; _navigationZoom = null; return move(point, DriverMapConfig.fallbackZoom); }
  Future<void> stopWebNavigation(domain.LatLng point) => stopNativeNavigation(point);
  void resetNavigationForNewMap() {
    _resumeTimer?.cancel(); _touches = 0; _lastCoursePoint = null; _lastCourseBearing = null; _navigationZoom = null;
    followPaused.value = false; webHeading.value = 0;
  }
  Future<void> move(domain.LatLng point, [double? zoom]) => _animate(gm.CameraPosition(
    target: gm.LatLng(point.latitude, point.longitude), zoom: zoom ?? DriverMapConfig.fallbackZoom, tilt: DriverMapConfig.homeTilt));

  Future<void> fitCoordinates(List<domain.LatLng> coordinates, {double padding = 90, double maxZoom = 16.5, bool animate = true}) async {
    final controller = _nativeController;
    if (!ready || controller == null || coordinates.isEmpty) return;
    final intent = ++_intent;
    final points = List<domain.LatLng>.of(coordinates);
    _resumeAction = () => fitCoordinates(points, padding: padding, maxZoom: maxZoom, animate: animate);
    if (followPaused.value) return;
    _automaticUntil = DateTime.now().add(const Duration(seconds: 2));
    if (kIsWeb) {
      final fit = RamoMapCameraFit.calculate(points: points.map((p) => RamoMapPoint(p.latitude, p.longitude)).toList(),
        viewport: _viewport, padding: _padding, edgePadding: padding, maxZoom: maxZoom);
      if (fit == null) return;
      _currentZoom = fit.zoom;
      // Preview may show the whole route. Navigation never invokes fitBounds.
      await controller.moveCamera(gm.CameraUpdate.newLatLngZoom(gm.LatLng(fit.center.latitude, fit.center.longitude), fit.zoom));
      return;
    }
    if (points.length == 1) { await move(points.first, maxZoom); return; }
    var minLat = points.first.latitude, maxLat = minLat, minLng = points.first.longitude, maxLng = minLng;
    for (final p in points.skip(1)) { minLat = math.min(minLat, p.latitude); maxLat = math.max(maxLat, p.latitude); minLng = math.min(minLng, p.longitude); maxLng = math.max(maxLng, p.longitude); }
    final update = gm.CameraUpdate.newLatLngBounds(gm.LatLngBounds(southwest: gm.LatLng(minLat,minLng), northeast: gm.LatLng(maxLat,maxLng)), padding);
    if (animate) { await controller.animateCamera(update); } else { await controller.moveCamera(update); }
    if (followPaused.value || !ready || intent != _intent) return;
    final zoom = await controller.getZoomLevel();
    if (zoom > maxZoom && !followPaused.value && intent == _intent) {
      if (animate) { await controller.animateCamera(gm.CameraUpdate.zoomTo(maxZoom)); } else { await controller.moveCamera(gm.CameraUpdate.zoomTo(maxZoom)); }
    }
  }
  void dispose() { _disposed = true; detach(); followPaused.dispose(); webHeading.dispose(); }
}

class DriverLiveMap extends StatefulWidget {
  const DriverLiveMap({
    super.key,
    required this.controller,
    required this.supply,
    required this.activeRide,
    required this.route,
    this.navigationMode = false,
    this.mapPadding = EdgeInsets.zero,
    this.nearbyDrivers = const [],
    this.onMapReady,
    this.networkTilesEnabled = true,
  });

  final DriverMapController controller;
  final DriverSupplySnapshot? supply;
  final AcceptedDriverRide? activeRide;
  final DriverRouteInfo? route;
  final bool navigationMode;
  final EdgeInsets mapPadding;
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
  void Function()? _disposeMapGestures;
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
    if (kIsWeb) _disposeMapGestures = subscribeDriverMapGestures(
      down: () => widget.controller.onMapPointerDown(), move: () => widget.controller.onMapPointerMove(),
      up: () => widget.controller.onMapPointerUp(), wheel: () => widget.controller.onMapWheel());
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
    if (widget.navigationMode) {
      unawaited(widget.controller.followNavigation(_driverPoint, route: widget.route?.points ?? const []));
      return;
    }
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
    _disposeMapGestures?.call();
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
      widget.controller.updateViewport(constraints.biggest, widget.mapPadding);
      return Listener(
        onPointerDown: kIsWeb ? null : (_) => widget.controller.onMapPointerDown(),
        onPointerMove: kIsWeb ? null : (_) => widget.controller.onMapPointerMove(),
        onPointerUp: kIsWeb ? null : (_) => widget.controller.onMapPointerUp(),
        onPointerCancel: kIsWeb ? null : (_) => widget.controller.onMapPointerUp(),
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
        tilt: DriverMapConfig.homeTilt,
      ),
      onMapCreated: _onMapCreated,
      onCameraMove: (position) { if (mounted) widget.controller.updateCamera(position); },
      onCameraMoveStarted: () { if (mounted) widget.controller.onCameraMoveStarted(); },
      onCameraIdle: () { if (mounted) widget.controller.onCameraIdle(); },
      padding: widget.mapPadding,
      webCameraControlEnabled: false,
      webCameraControlPosition: gm.WebCameraControlPosition.rightBottom,
      markers: _markers,
      polylines: _polylines,
      minMaxZoomPreference: const gm.MinMaxZoomPreference(4, 19),
      compassEnabled: !kIsWeb && widget.navigationMode,
      zoomControlsEnabled: false,
      mapToolbarEnabled: false,
      myLocationEnabled: false,
      myLocationButtonEnabled: false,
      rotateGesturesEnabled: true,
      tiltGesturesEnabled: true,
      buildingsEnabled: true,
      indoorViewEnabled: false,
      trafficEnabled: widget.navigationMode,
        ),
      );
    });
  }
}


