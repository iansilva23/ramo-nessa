import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'package:latlong2/latlong.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/config/ramo_map_config.dart';
import '../../../core/location/geolocator_location_service.dart';
import '../../../core/location/location_service.dart';
import '../../map/data/place_search_service.dart';
import '../../map/domain/ramo_place.dart';

class SavedPlacePinScreen extends StatefulWidget {
  const SavedPlacePinScreen({super.key, required this.searchService, this.initialPosition,
    this.locationService});
  final PlaceSearchService searchService;
  final LatLng? initialPosition;
  final LocationService? locationService;

  @override
  State<SavedPlacePinScreen> createState() => _SavedPlacePinScreenState();
}

class _SavedPlacePinScreenState extends State<SavedPlacePinScreen> {
  late LatLng _point = widget.initialPosition ?? RamoMapConfig.fallbackCenter;
  gm.GoogleMapController? _map;
  bool _locating = false;
  bool _saving = false;
  bool _moving = false;
  int _revision = 0;
  String? _message;

  @override
  void dispose() {
    _map?.dispose();
    super.dispose();
  }

  Future<void> _locate() async {
    if (_locating || _saving) return;
    final revision = _revision;
    setState(() { _locating = true; _message = null; });
    try {
      final point = await (widget.locationService ?? GeolocatorLocationService()).getCurrentLocation();
      if (!mounted || revision != _revision) return;
      setState(() => _point = point);
      await _map?.animateCamera(gm.CameraUpdate.newLatLngZoom(
        gm.LatLng(point.latitude, point.longitude), 18));
    } catch (_) {
      if (!mounted || revision != _revision) return;
      setState(() => _message = 'Não conseguimos acessar sua localização. Escolha o ponto movendo o mapa.');
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _confirm() async {
    if (_saving || _moving) return;
    final point = _point;
    setState(() => _saving = true);
    RamoPlace? resolved;
    final service = widget.searchService;
    try {
      if (service is CoordinateAddressResolver) resolved = await service.reverseCoordinate(point);
    } catch (_) { /* The exact pin remains usable without an address. */ }
    if (!mounted) return;
    Navigator.of(context).pop(resolved ?? RamoPlace(name: 'Local escolhido no mapa',
      address: 'Local escolhido no mapa', position: point, mapPinned: true));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Escolher no mapa')),
    body: Column(children: [
      const Padding(padding: EdgeInsets.all(16), child: Text(
        'Mova o mapa para posicionar o alfinete na entrada do endereço.')),
      Expanded(child: Stack(alignment: Alignment.center, children: [
        gm.GoogleMap(
          initialCameraPosition: gm.CameraPosition(target: gm.LatLng(_point.latitude, _point.longitude), zoom: 17),
          onMapCreated: (controller) {
            _map = controller;
            if (widget.initialPosition == null) _locate();
          },
          style: Theme.of(context).brightness == Brightness.dark ? ramoDarkMapStyle : null,
          myLocationButtonEnabled: false, zoomControlsEnabled: false,
          onCameraMoveStarted: () { _revision++; setState(() => _moving = true); },
          onCameraMove: (position) => _point = LatLng(position.target.latitude, position.target.longitude),
          onCameraIdle: () { if (mounted) setState(() => _moving = false); },
          scrollGesturesEnabled: !_saving, zoomGesturesEnabled: !_saving,
          rotateGesturesEnabled: !_saving, tiltGesturesEnabled: !_saving,
        ),
        const IgnorePointer(child: Padding(padding: EdgeInsets.only(bottom: 42),
          child: Icon(Icons.location_pin, size: 48, color: RamoColors.success))),
      ])),
      SafeArea(top: false, child: Padding(padding: const EdgeInsets.all(16), child: Column(children: [
        if (_message != null) Text(_message!),
        Text('${_point.latitude.toStringAsFixed(6)}, ${_point.longitude.toStringAsFixed(6)}'),
        TextButton.icon(onPressed: _locating || _saving ? null : _locate,
          icon: const Icon(Icons.my_location), label: Text(_locating ? 'Localizando…' : 'Usar minha localização')),
        SizedBox(width: double.infinity, child: FilledButton(onPressed: _saving || _moving ? null : _confirm,
          child: Text(_saving ? 'Buscando endereço…' : 'Confirmar este ponto'))),
      ]))),
    ]),
  );
}
