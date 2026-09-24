import 'dart:async';

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart' as domain;
import 'package:maplibre_gl/maplibre_gl.dart' as ml;

import '../../../../core/config/ramo_map_config.dart';
import '../../../map/domain/ramo_place.dart';

class RamoMapController {
  ml.MapLibreMapController? _nativeController;
  bool _styleReady = false;
  bool _disposed = false;

  bool get ready =>
      !_disposed && _nativeController != null && _styleReady;

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

  Future<void> move(domain.LatLng point, double zoom) async {
    final controller = _nativeController;
    if (!ready || controller == null) return;
    await controller.animateCamera(
      ml.CameraUpdate.newLatLngZoom(
        ml.LatLng(point.latitude, point.longitude),
        zoom,
      ),
      duration: const Duration(milliseconds: 450),
    );
  }

  Future<void> fitCoordinates({
    required List<domain.LatLng> coordinates,
    required EdgeInsets padding,
    double maxZoom = 16,
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
      minLatitude =
          point.latitude < minLatitude ? point.latitude : minLatitude;
      maxLatitude =
          point.latitude > maxLatitude ? point.latitude : maxLatitude;
      minLongitude =
          point.longitude < minLongitude ? point.longitude : minLongitude;
      maxLongitude =
          point.longitude > maxLongitude ? point.longitude : maxLongitude;
    }

    await controller.animateCamera(
      ml.CameraUpdate.newLatLngBounds(
        ml.LatLngBounds(
          southwest: ml.LatLng(minLatitude, minLongitude),
          northeast: ml.LatLng(maxLatitude, maxLongitude),
        ),
        left: padding.left,
        top: padding.top,
        right: padding.right,
        bottom: padding.bottom,
      ),
      duration: const Duration(milliseconds: 550),
    );

    final currentZoom = controller.cameraPosition?.zoom;
    if (currentZoom != null && currentZoom > maxZoom) {
      await controller.animateCamera(
        ml.CameraUpdate.zoomTo(maxZoom),
        duration: const Duration(milliseconds: 180),
      );
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
    this.driverPosition,
    this.driverPositionStale = false,
    this.onMapReady,
    this.networkTilesEnabled = true,
  });

  final RamoMapController controller;
  final RamoPlace? origin;
  final RamoPlace? destination;
  final List<domain.LatLng> routePoints;
  final domain.LatLng? driverPosition;
  final bool driverPositionStale;
  final VoidCallback? onMapReady;
  final bool networkTilesEnabled;

  @override
  State<RamoLiveMap> createState() => _RamoLiveMapState();
}

class _RamoLiveMapState extends State<RamoLiveMap> {
  ml.MapLibreMapController? _nativeController;
  bool _styleReady = false;
  int _annotationGeneration = 0;
  bool _placeholderReadyNotified = false;

  @override
  void initState() {
    super.initState();
    _notifyPlaceholderReadyIfNeeded();
  }

  @override
  void didUpdateWidget(covariant RamoLiveMap oldWidget) {
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
        (oldWidget.origin != widget.origin ||
            oldWidget.destination != widget.destination ||
            oldWidget.driverPosition != widget.driverPosition ||
            oldWidget.driverPositionStale != widget.driverPositionStale ||
            !_samePoints(oldWidget.routePoints, widget.routePoints))) {
      unawaited(_syncAnnotations());
    }
  }

  bool _samePoints(
    List<domain.LatLng> first,
    List<domain.LatLng> second,
  ) {
    if (identical(first, second)) return true;
    if (first.length != second.length) return false;
    for (var index = 0; index < first.length; index += 1) {
      if (first[index] != second[index]) return false;
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

    if (widget.routePoints.length >= 2) {
      await controller.addLine(
        ml.LineOptions(
          geometry: widget.routePoints
              .map(
                (point) =>
                    ml.LatLng(point.latitude, point.longitude),
              )
              .toList(growable: false),
          lineColor: '#111111',
          lineWidth: 6,
          lineOpacity: 0.96,
          lineJoin: 'round',
        ),
      );
    }

    final circles = <ml.CircleOptions>[
      if (widget.origin != null)
        ml.CircleOptions(
          geometry: ml.LatLng(
            widget.origin!.position.latitude,
            widget.origin!.position.longitude,
          ),
          circleRadius: 9,
          circleColor: '#F7C600',
          circleStrokeWidth: 4,
          circleStrokeColor: '#111111',
        ),
      if (widget.destination != null)
        ml.CircleOptions(
          geometry: ml.LatLng(
            widget.destination!.position.latitude,
            widget.destination!.position.longitude,
          ),
          circleRadius: 10,
          circleColor: '#111111',
          circleStrokeWidth: 4,
          circleStrokeColor: '#F7C600',
        ),
      if (widget.driverPosition != null)
        ml.CircleOptions(
          geometry: ml.LatLng(
            widget.driverPosition!.latitude,
            widget.driverPosition!.longitude,
          ),
          circleRadius: 11,
          circleColor:
              widget.driverPositionStale ? '#777777' : '#111111',
          circleStrokeWidth: 5,
          circleStrokeColor: '#F7C600',
        ),
    ];

    if (circles.isNotEmpty) {
      await controller.addCircles(circles);
    }
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

    return ml.MapLibreMap(
      initialCameraPosition: ml.CameraPosition(
        target: ml.LatLng(
          RamoMapConfig.fallbackCenter.latitude,
          RamoMapConfig.fallbackCenter.longitude,
        ),
        zoom: RamoMapConfig.fallbackZoom,
      ),
      styleString: RamoMapConfig.openFreeMapStyleUrl,
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
