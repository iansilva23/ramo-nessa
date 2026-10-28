import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart' as domain;
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../../core/config/driver_map_config.dart';
import '../../../../core/location/driver_location_service.dart';
import '../../../../core/location/driver_travel_heading.dart';
import '../../../../core/config/driver_web_heading_config.dart';
import '../../../../core/map/ramo_map_marker_icons.dart';
import '../../../../core/map/driver_map_gestures.dart';
import '../../domain/driver_models.dart';
import '../../domain/driver_route_info.dart';
import 'driver_camera_padding.dart';
import 'driver_follow_frame.dart';

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
  DriverMapController({DateTime Function()? now}) : _now = now ?? DateTime.now;
  final DateTime Function() _now;
  final DriverTravelHeading _travel = DriverTravelHeading();
  gm.GoogleMapController? _nativeController;
  bool _disposed = false, _visible = true, _writing = false, _gesture = false;
  double _currentZoom = DriverMapConfig.fallbackZoom;
  Size _viewport = Size.zero;
  EdgeInsets _padding = EdgeInsets.zero;
  final ValueNotifier<bool> followPaused = ValueNotifier(false);
  final ValueNotifier<double> webHeading = ValueNotifier(0);
  Timer? _settleTimer;
  int _touches = 0, _generation = 0, _intent = 0;
  DateTime _automaticUntil = DateTime.fromMillisecondsSinceEpoch(0);
  gm.CameraPosition? _queued, _lastCamera;
  domain.LatLng? _latestPoint, _gpsPoint;
  DriverFollowFrame? _frame;
  bool get hasChosenFrame => _frame != null;
  double get vehicleBearing => _travel.bearing ?? 0;
  bool get ready => !_disposed && _nativeController != null;
  double get currentZoom => _currentZoom;
  void updateViewport(Size size, [EdgeInsets padding = EdgeInsets.zero]) { _viewport = size; _padding = padding; }
  void attach(gm.GoogleMapController controller) { if (!_disposed) _nativeController = controller; }
  void observePosition(DriverPosition fix) {
    if (_disposed) return;
    _travel.update(fix, now: _now());
    if (fix.latitude.isFinite && fix.longitude.isFinite && fix.latitude.abs() <= 90 && fix.longitude.abs() <= 180) {
      _gpsPoint = domain.LatLng(fix.latitude, fix.longitude); _latestPoint = _gpsPoint;
    }
  }
  void setVisible(bool visible) {
    if (_disposed) return;
    if (!visible && _gesture) _finishGesture();
    _visible = visible;
    if (!visible) _queued = null;
  }
  void detach() {
    if (!_disposed && _gesture) _finishGesture();
    _generation++; _intent++; _settleTimer?.cancel(); _queued = null;
    _touches = 0; _gesture = false; _nativeController = null;
  }
  void updateCamera(gm.CameraPosition position) {
    if (_disposed) return;
    _lastCamera = position; _currentZoom = position.zoom; webHeading.value = position.bearing;
    if (_gesture && _touches == 0) _scheduleSettle();
  }
  void _pause() {
    if (_disposed) return;
    _intent++; _settleTimer?.cancel(); _queued = null; _gesture = true; followPaused.value = true;
  }
  void onMapPointerDown() { _touches++; _pause(); }
  void onMapPointerMove() { if (_touches > 0) _pause(); }
  void onMapPointerUp() { if (_touches > 0) _touches--; if (_touches == 0) _scheduleSettle(); }
  void onMapWheel() { _pause(); if (_touches == 0) _scheduleSettle(); }
  void onCameraMoveStarted() {
    if (_touches > 0) { _pause(); return; }
    if (_now().isBefore(_automaticUntil)) return;
    _pause(); _scheduleSettle();
  }
  void onCameraIdle() { if (_gesture && _touches == 0) _finishGesture(); }
  void _scheduleSettle() {
    _settleTimer?.cancel();
    if (_disposed || !_gesture || _touches > 0) return;
    final generation = _generation;
    _settleTimer = Timer(DriverMapConfig.gestureSettleDelay, () {
      if (_disposed || generation != _generation || _touches > 0) return;
      _finishGesture();
    });
  }
  void _finishGesture() {
    if (_disposed) return;
    _settleTimer?.cancel();
    final camera = _lastCamera, point = _latestPoint;
    if (camera != null && point != null) {
      _frame = DriverFollowFrame.capture(camera: camera, vehicle: point,
        course: _travel.bearing ?? 0, viewport: _viewport, padding: _padding, web: kIsWeb) ?? _frame;
    }
    _gesture = false; followPaused.value = false;
    // Capture the view exactly where the user left it. The next GPS fix moves
    // this frame with the vehicle; there is no return-to-default timer.
  }
  void resumeNativeFollow() {
    if (!_disposed && !_gesture && _touches == 0) followPaused.value = false;
  }
  void recenterDriver() {
    if (_disposed || _touches > 0) return;
    if (_gesture) _finishGesture();
    final frame = _frame;
    if (frame != null && !_viewport.isEmpty) {
      final center = DriverFollowFrame.center(_viewport, _padding, false);
      _frame = DriverFollowFrame(zoom: frame.zoom, tilt: frame.tilt, bearingOffset: frame.bearingOffset,
        anchor: Offset(center.dx / _viewport.width, center.dy / _viewport.height));
    }
    followPaused.value = false;
  }
  gm.CameraPosition cameraFor(domain.LatLng point) {
    final frame = _frame;
    if (frame != null) return frame.cameraFor(vehicle: point, course: _travel.bearing ?? 0,
      viewport: _viewport, padding: _padding, web: kIsWeb);
    final camera = gm.CameraPosition(target: gm.LatLng(point.latitude, point.longitude),
      zoom: _currentZoom, tilt: _lastCamera?.tilt ?? DriverMapConfig.homeTilt,
      bearing: _travel.bearing ?? _lastCamera?.bearing ?? 0);
    return kIsWeb ? driverWebPaddedCamera(camera, _padding) : camera;
  }
  Future<void> _animate(gm.CameraPosition position) async {
    _intent++;
    if (!ready || !_visible || followPaused.value) return;
    _queued = position;
    if (_writing) return;
    _writing = true;
    final generation = _generation, controller = _nativeController!;
    try {
      while (_queued != null && !followPaused.value && ready && _visible && generation == _generation) {
        final next = _queued!; _queued = null;
        _lastCamera = next; _automaticUntil = _now().add(const Duration(seconds: 2));
        _currentZoom = next.zoom; webHeading.value = next.bearing;
        await controller.animateCamera(gm.CameraUpdate.newCameraPosition(next));
      }
    } catch (error) { debugPrint('Câmera do motorista indisponível: $error'); }
    finally {
      _writing = false;
      final pending = _queued;
      if (pending != null && ready && _visible && !followPaused.value) unawaited(_animate(pending));
    }
  }
  Future<void> zoomBy(double delta) async {
    final controller = _nativeController, last = _lastCamera;
    if (!ready || controller == null || last == null || !_visible) return;
    onMapWheel();
    final camera = gm.CameraPosition(target: last.target, zoom: (_currentZoom + delta).clamp(4.0, 19.0).toDouble(),
      tilt: last.tilt, bearing: last.bearing);
    _lastCamera = camera; _currentZoom = camera.zoom;
    _automaticUntil = _now().add(const Duration(seconds: 2));
    try { await controller.animateCamera(gm.CameraUpdate.newCameraPosition(camera)); }
    catch (error) { debugPrint('Zoom manual indisponível: $error'); }
  }
  Future<void> followNavigation(domain.LatLng point, {List<domain.LatLng> route = const []}) {
    _latestPoint = _gpsPoint ?? point;
    return _animate(cameraFor(_latestPoint!));
  }
  Future<void> enterWebDrivingPerspective(domain.LatLng point, {List<domain.LatLng> route = const []}) => followNavigation(point, route: route);
  Future<void> stopNativeNavigation(domain.LatLng point) => move(point);
  Future<void> stopWebNavigation(domain.LatLng point) => move(point);
  void resetNavigationForNewMap() {
    _settleTimer?.cancel(); _touches = 0; _gesture = false;
    followPaused.value = false;
  }
  Future<void> move(domain.LatLng point, [double? zoom]) {
    _latestPoint = _gpsPoint ?? point;
    if (_frame == null && _lastCamera == null && zoom != null) _currentZoom = zoom;
    return _animate(cameraFor(_latestPoint!));
  }
  Future<void> fitCoordinates(List<domain.LatLng> coordinates, {double padding = 90, double maxZoom = 16.5, bool animate = true}) async {
    final controller = _nativeController;
    if (!ready || !_visible || controller == null || coordinates.isEmpty || _frame != null || _gesture) return;
    final intent = ++_intent;
    _automaticUntil = _now().add(const Duration(seconds: 2));
    if (kIsWeb) {
      final fit = RamoMapCameraFit.calculate(points: coordinates.map((p) => RamoMapPoint(p.latitude, p.longitude)).toList(),
        viewport: _viewport, padding: _padding, edgePadding: padding, maxZoom: maxZoom);
      if (fit == null) return;
      _currentZoom = fit.zoom;
      await controller.moveCamera(gm.CameraUpdate.newLatLngZoom(gm.LatLng(fit.center.latitude, fit.center.longitude), fit.zoom));
      return;
    }
    if (coordinates.length == 1) { await move(coordinates.first, maxZoom); return; }
    var minLat = coordinates.first.latitude, maxLat = minLat, minLng = coordinates.first.longitude, maxLng = minLng;
    for (final p in coordinates.skip(1)) { minLat = math.min(minLat, p.latitude); maxLat = math.max(maxLat, p.latitude); minLng = math.min(minLng, p.longitude); maxLng = math.max(maxLng, p.longitude); }
    final update = gm.CameraUpdate.newLatLngBounds(gm.LatLngBounds(southwest: gm.LatLng(minLat,minLng), northeast: gm.LatLng(maxLat,maxLng)), padding);
    if (animate) { await controller.animateCamera(update); } else { await controller.moveCamera(update); }
    if (followPaused.value || !ready || intent != _intent) return;
    final zoom = await controller.getZoomLevel();
    if (zoom > maxZoom && !followPaused.value && intent == _intent) {
      if (animate) { await controller.animateCamera(gm.CameraUpdate.zoomTo(maxZoom)); } else { await controller.moveCamera(gm.CameraUpdate.zoomTo(maxZoom)); }
    }
  }
  void dispose() { _disposed = true; _settleTimer?.cancel(); detach(); followPaused.dispose(); webHeading.dispose(); }
}

class DriverLiveMap extends StatefulWidget {
  const DriverLiveMap({
    super.key,
    required this.controller,
    required this.supply,
    required this.activeRide,
    required this.route,
    this.navigationMode = false,
    this.devicePosition,
    this.headingDegrees,
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
  final domain.LatLng? devicePosition;
  final double? headingDegrees;
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
    final live = widget.devicePosition;
    if (live != null) return live;
    final supply = widget.supply;
    if (supply == null) return DriverMapConfig.fallbackCenter;
    return domain.LatLng(supply.latitude, supply.longitude);
  }

  @override
  void initState() {
    super.initState();
    _displayDriverBearing = widget.headingDegrees ?? 0;
    if (kIsWeb) {
      _disposeMapGestures = subscribeDriverMapGestures(
      down: () => widget.controller.onMapPointerDown(), move: () => widget.controller.onMapPointerMove(),
      up: () => widget.controller.onMapPointerUp(), wheel: () => widget.controller.onMapWheel());
    }
    final supply = widget.supply;
    if (supply != null) {
      _displayDriverPoint = widget.devicePosition ?? domain.LatLng(supply.latitude, supply.longitude);
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
      _displayDriverBearing = widget.headingDegrees ?? sample.bearing;
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
        _displayDriverBearing = widget.headingDegrees ?? _bearingBetween(current, to);
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
    if (widget.headingDegrees != null) _displayDriverBearing = widget.headingDegrees!;

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

    final previous = oldWidget.devicePosition ?? (oldWidget.supply == null ? null : domain.LatLng(oldWidget.supply!.latitude, oldWidget.supply!.longitude));
    final next = widget.devicePosition ?? (widget.supply == null ? null : domain.LatLng(widget.supply!.latitude, widget.supply!.longitude));
    if (next == null) {
      _driverMoveController.stop(); _displayDriverPoint = null;
    } else if (previous == null) {
      _driverMoveController.stop(); _displayDriverPoint = next;
    } else if (previous.latitude != next.latitude || previous.longitude != next.longitude) {
      _moveDriverSmoothly(previous, next);
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
      final padding = driverCameraPadding(constraints.biggest, widget.mapPadding);
      widget.controller.updateViewport(constraints.biggest, padding);
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
      initialCameraPosition: widget.controller.cameraFor(driverPoint),
      onMapCreated: _onMapCreated,
      onCameraMove: (position) { if (mounted) widget.controller.updateCamera(position); },
      onCameraMoveStarted: () { if (mounted) widget.controller.onCameraMoveStarted(); },
      onCameraIdle: () { if (mounted) widget.controller.onCameraIdle(); },
      padding: padding,
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


