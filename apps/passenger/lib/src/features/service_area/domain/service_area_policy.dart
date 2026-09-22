import 'package:latlong2/latlong.dart';

import 'service_zone.dart';

class ServiceAreaCheck {
  const ServiceAreaCheck({
    required this.originZone,
    required this.destinationZone,
  });

  final ServiceZone? originZone;
  final ServiceZone? destinationZone;

  bool get isSupported => originZone != null && destinationZone != null;

  String? get message {
    if (originZone == null && destinationZone == null) {
      return 'Origem e destino estão fora da área atendida.';
    }
    if (originZone == null) {
      return 'A origem está fora da área atendida.';
    }
    if (destinationZone == null) {
      return 'O destino está fora da área atendida.';
    }
    return null;
  }
}

/// Geofences operacionais iniciais do MVP.
///
/// Os raios são configuração de produto, não limites administrativos.
/// Eles foram dimensionados para cobrir Jeri, Jijoca, Preá e o corredor local
/// entre essas regiões. Antes do lançamento comercial podem ser substituídos
/// por polígonos vindos do backend/admin sem alterar o fluxo do app.
abstract final class RamoServiceArea {
  static const zones = <ServiceZone>[
    ServiceZone(
      id: 'jericoacoara',
      label: 'Jericoacoara',
      center: LatLng(-2.80023, -40.51638),
      radiusMeters: 7000,
    ),
    ServiceZone(
      id: 'jijoca',
      label: 'Jijoca',
      center: LatLng(-2.89860, -40.45060),
      radiusMeters: 7500,
    ),
    ServiceZone(
      id: 'prea',
      label: 'Preá',
      center: LatLng(-2.82017, -40.41467),
      radiusMeters: 6500,
    ),
  ];

  static ServiceZone? zoneFor(LatLng point) {
    for (final zone in zones) {
      if (zone.contains(point)) {
        return zone;
      }
    }
    return null;
  }

  static bool contains(LatLng point) => zoneFor(point) != null;

  static ServiceAreaCheck checkTrip({
    required LatLng origin,
    required LatLng destination,
  }) {
    return ServiceAreaCheck(
      originZone: zoneFor(origin),
      destinationZone: zoneFor(destination),
    );
  }
}
