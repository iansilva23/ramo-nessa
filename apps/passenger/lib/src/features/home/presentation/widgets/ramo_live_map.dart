import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart' as domain;

import '../../../../core/config/ramo_map_config.dart';
import '../../../../core/map/ramo_map_marker_icons.dart';
import '../../../map/domain/ramo_place.dart';

class RamoMapController {
  gm.GoogleMapController? _nativeController;
  bool _disposed = false;

  bool get ready => !_disposed && _nativeController != null;

  void attach(gm.GoogleMapController controller) {
    if (_disposed) return;
    _nativeController = controller;
  }

  void detach() {
    _nativeController = null;
  }

  Future<void> move(domain.LatLng point, double zoom) async {
    final controller = _nativeController;
    if (!ready || controller == null) return;

    await controller.animateCamera(
      gm.CameraUpdate.newLatLngZoom(
        gm.LatLng(point.latitude, point.longitude),
        zoom,
      ),
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

    final uniformPadding = math.max(
      math.max(padding.left, padding.right),
      math.max(padding.top, padding.bottom),
    );

    await controller.animateCamera(
      gm.CameraUpdate.newLatLngBounds(
        gm.LatLngBounds(
          southwest: gm.LatLng(minLatitude, minLongitude),
          northeast: gm.LatLng(maxLatitude, maxLongitude),
        ),
        uniformPadding,
      ),
    );

    final currentZoom = await controller.getZoomLevel();
    if (currentZoom > maxZoom) {
      await controller.animateCamera(
        gm.CameraUpdate.zoomTo(maxZoom),
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
    this.driverCategory,
    this.driverPositionStale = false,
    this.onMapReady,
    this.networkTilesEnabled = true,
  });

  final RamoMapController controller;
  final RamoPlace? origin;
  final RamoPlace? destination;
  final List<domain.LatLng> routePoints;
  final domain.LatLng? driverPosition;
  final String? driverCategory;
  final bool driverPositionStale;
  final VoidCallback? onMapReady;
  final bool networkTilesEnabled;

  @override
  State<RamoLiveMap> createState() => _RamoLiveMapState();
}

class _RamoLiveMapState extends State<RamoLiveMap> {
  gm.GoogleMapController? _nativeController;
  bool _placeholderReadyNotified = false;
  double _driverBearing = 0;
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
    _notifyPlaceholderReadyIfNeeded();
    _loadMarkerIcons();
  }

  Future<void> _loadMarkerIcons() async {
    final passengerIcon = await buildRamoMapMarker(
      icon: Icons.person_rounded,
      background: const Color(0xFFFFFFFF),
      foreground: const Color(0xFF111111),
      border: const Color(0xFFFFC400),
    );
    final destinationIcon = await buildRamoMapMarker(
      icon: Icons.flag_rounded,
      background: const Color(0xFF111111),
      foreground: const Color(0xFFFFFFFF),
      border: const Color(0xFFFFFFFF),
    );
    final driverIcon = await buildRamoMapMarker(
      icon: ramoVehicleIcon(widget.driverCategory),
    );
    final staleDriverIcon = await buildRamoMapMarker(
      icon: ramoVehicleIcon(widget.driverCategory),
      background: const Color(0xFFB23A3A),
      foreground: const Color(0xFFFFFFFF),
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

    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.detach();
      final native = _nativeController;
      if (native != null) widget.controller.attach(native);
    }

    if (oldWidget.networkTilesEnabled != widget.networkTilesEnabled) {
      _notifyPlaceholderReadyIfNeeded();
    }

    final previousDriver = oldWidget.driverPosition;
    final nextDriver = widget.driverPosition;
    if (previousDriver != null &&
        nextDriver != null &&
        (previousDriver.latitude != nextDriver.latitude ||
            previousDriver.longitude != nextDriver.longitude)) {
      _driverBearing = _bearingBetween(previousDriver, nextDriver);
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
          anchor: const Offset(.5, .5),
          infoWindow: gm.InfoWindow(
            title: 'Destino',
            snippet: destination.name,
          ),
        ),
      );
    }

    final driver = widget.driverPosition;
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
          rotation: _driverBearing,
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

    return {
      gm.Polyline(
        polylineId: const gm.PolylineId('ride-route'),
        points: widget.routePoints
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

    return gm.GoogleMap(
      initialCameraPosition: gm.CameraPosition(
        target: gm.LatLng(
          RamoMapConfig.fallbackCenter.latitude,
          RamoMapConfig.fallbackCenter.longitude,
        ),
        zoom: RamoMapConfig.fallbackZoom,
      ),
      onMapCreated: _onMapCreated,
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
      trafficEnabled: false,
    );
  }
}
