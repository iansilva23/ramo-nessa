import 'dart:async';

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart' as domain;
import 'package:maplibre_gl/maplibre_gl.dart' as ml;

import '../../../../core/config/driver_map_config.dart';
import '../../domain/driver_models.dart';
import '../../domain/driver_route_info.dart';

class DriverMapController {
  ml.MapLibreMapController? _nativeController;
  bool _styleReady = false;
  bool _disposed = false;

  bool get ready =>
      !_disposed && _nativeController != null && _styleReady;

  double get currentZoom =>
      _nativeController?.cameraPosition?.zoom ??
      DriverMapConfig.fallbackZoom;

  void attach(ml.MapLibreMapController controller) {
    if (_disposed) return;
    _nativeController = controller;
  }

  void markStyleReady() {
    if (_disposed) return;
    _styleReady = true;
  }

  void detach() {
    _nativeController = null;
    _styleReady = false;
  }

  Future<void> move(domain.LatLng point, [double? zoom]) async {
    final controller = _nativeController;
    if (!ready || controller == null) return;

    final update = zoom == null
        ? ml.CameraUpdate.newLatLng(
            ml.LatLng(point.latitude, point.longitude),
          )
        : ml.CameraUpdate.newLatLngZoom(
            ml.LatLng(point.latitude, point.longitude),
            zoom,
          );

    await controller.animateCamera(
      update,
      duration: const Duration(milliseconds: 380),
    );
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
    this.nearbyDrivers = const [],
    this.onMapReady,
    this.networkTilesEnabled = true,
  });

  final DriverMapController controller;
  final DriverSupplySnapshot? supply;
  final AcceptedDriverRide? activeRide;
  final DriverRouteInfo? route;
  final List<NearbyDriverPosition> nearbyDrivers;
  final VoidCallback? onMapReady;
  final bool networkTilesEnabled;

  @override
  State<DriverLiveMap> createState() => _DriverLiveMapState();
}

class _DriverLiveMapState extends State<DriverLiveMap> {
  ml.MapLibreMapController? _nativeController;
  bool _styleReady = false;
  int _annotationGeneration = 0;
  bool _placeholderReadyNotified = false;

  domain.LatLng get _driverPoint {
    final supply = widget.supply;
    if (supply == null) return DriverMapConfig.fallbackCenter;
    return domain.LatLng(supply.latitude, supply.longitude);
  }

  @override
  void initState() {
    super.initState();
    _notifyPlaceholderReadyIfNeeded();
  }

  @override
  void didUpdateWidget(covariant DriverLiveMap oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.detach();
      final native = _nativeController;
      if (native != null) widget.controller.attach(native);
      if (_styleReady) widget.controller.markStyleReady();
    }

    if (oldWidget.networkTilesEnabled != widget.networkTilesEnabled) {
      _notifyPlaceholderReadyIfNeeded();
    }

    if (_styleReady &&
        (oldWidget.supply != widget.supply ||
            oldWidget.activeRide != widget.activeRide ||
            oldWidget.route != widget.route ||
            !_sameNearbyDrivers(
              oldWidget.nearbyDrivers,
              widget.nearbyDrivers,
            ))) {
      unawaited(_syncAnnotations());
    }
  }

  bool _sameNearbyDrivers(
    List<NearbyDriverPosition> first,
    List<NearbyDriverPosition> second,
  ) {
    if (identical(first, second)) return true;
    if (first.length != second.length) return false;
    for (var index = 0; index < first.length; index += 1) {
      final a = first[index];
      final b = second[index];
      if (a.latitude != b.latitude ||
          a.longitude != b.longitude ||
          a.busy != b.busy ||
          a.locationAgeSeconds != b.locationAgeSeconds) {
        return false;
      }
    }
    return true;
  }

  void _notifyPlaceholderReadyIfNeeded() {
    if (widget.networkTilesEnabled || _placeholderReadyNotified) return;
    _placeholderReadyNotified = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      widget.onMapReady?.call();
    });
  }

  void _onMapCreated(ml.MapLibreMapController controller) {
    _nativeController = controller;
    widget.controller.attach(controller);
  }

  void _onStyleLoaded() {
    _styleReady = true;
    widget.controller.markStyleReady();
    unawaited(_syncAnnotations());
    widget.onMapReady?.call();
  }

  Future<void> _syncAnnotations() async {
    final controller = _nativeController;
    if (!_styleReady || controller == null) return;

    final generation = ++_annotationGeneration;
    await controller.clearLines();
    await controller.clearCircles();
    if (!mounted || generation != _annotationGeneration) return;

    final route = widget.route;
    if (route != null && route.points.length >= 2) {
      await controller.addLine(
        ml.LineOptions(
          geometry: route.points
              .map(
                (point) =>
                    ml.LatLng(point.latitude, point.longitude),
              )
              .toList(growable: false),
          lineColor: '#111111',
          lineWidth: 7,
          lineOpacity: 0.96,
          lineJoin: 'round',
        ),
      );
    }

    final pickup = widget.activeRide?.pickupLatitude == null ||
            widget.activeRide?.pickupLongitude == null
        ? null
        : ml.LatLng(
            widget.activeRide!.pickupLatitude!,
            widget.activeRide!.pickupLongitude!,
          );

    final dropoff = widget.activeRide?.dropoffLatitude == null ||
            widget.activeRide?.dropoffLongitude == null
        ? null
        : ml.LatLng(
            widget.activeRide!.dropoffLatitude!,
            widget.activeRide!.dropoffLongitude!,
          );

    final circles = <ml.CircleOptions>[
      ...widget.nearbyDrivers.map(
        (driver) => ml.CircleOptions(
          geometry: ml.LatLng(driver.latitude, driver.longitude),
          circleRadius: 7,
          circleColor: driver.busy ? '#9A9A9A' : '#FFFFFF',
          circleStrokeWidth: 3,
          circleStrokeColor:
              driver.busy ? '#666666' : '#111111',
          circleOpacity: 0.94,
        ),
      ),
      ml.CircleOptions(
        geometry: ml.LatLng(
          _driverPoint.latitude,
          _driverPoint.longitude,
        ),
        circleRadius: 11,
        circleColor: '#111111',
        circleStrokeWidth: 5,
        circleStrokeColor: '#F7C600',
      ),
      if (pickup != null)
        ml.CircleOptions(
          geometry: pickup,
          circleRadius: 9,
          circleColor: '#FFFFFF',
          circleStrokeWidth: 4,
          circleStrokeColor: '#111111',
        ),
      if (dropoff != null)
        ml.CircleOptions(
          geometry: dropoff,
          circleRadius: 10,
          circleColor: '#F7C600',
          circleStrokeWidth: 4,
          circleStrokeColor: '#111111',
        ),
    ];

    await controller.addCircles(circles);
  }

  @override
  void dispose() {
    _annotationGeneration += 1;
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
    return ml.MapLibreMap(
      initialCameraPosition: ml.CameraPosition(
        target: ml.LatLng(
          driverPoint.latitude,
          driverPoint.longitude,
        ),
        zoom: DriverMapConfig.fallbackZoom,
      ),
      styleString: DriverMapConfig.openFreeMapStyleUrl,
      onMapCreated: _onMapCreated,
      onStyleLoadedCallback: _onStyleLoaded,
      minMaxZoomPreference: const ml.MinMaxZoomPreference(4, 19),
      compassEnabled: false,
      rotateGesturesEnabled: true,
      tiltGesturesEnabled: false,
      trackCameraPosition: true,
      myLocationEnabled: false,
    );
  }
}
