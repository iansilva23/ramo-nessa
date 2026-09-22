import 'package:latlong2/latlong.dart';

import '../../map/domain/ramo_place.dart';
import 'approved_destination_catalog.dart';
import 'service_zone.dart';

class ServiceAreaEndpoint {
  const ServiceAreaEndpoint({
    required this.id,
    required this.label,
  });

  final String id;
  final String label;
}

class ServiceAreaCheck {
  const ServiceAreaCheck({
    required this.originZone,
    required this.destinationZone,
  });

  final ServiceAreaEndpoint? originZone;
  final ServiceAreaEndpoint? destinationZone;

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
    ServiceZone(
      id: 'airport-jjd',
      label: 'Aeroporto JJD',
      center: LatLng(-2.906425, -40.357338),
      radiusMeters: 3000,
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

  static ServiceAreaEndpoint? endpointForPlace(RamoPlace place) {
    final local = zoneFor(place.position);
    if (local != null) {
      return ServiceAreaEndpoint(id: local.id, label: local.label);
    }

    final external = ApprovedDestinationCatalog.matchPlace(place);
    if (external != null) {
      return ServiceAreaEndpoint(
        id: 'external',
        label: external.label,
      );
    }

    return null;
  }

  static bool contains(LatLng point) => zoneFor(point) != null;

  static ServiceAreaCheck checkTrip({
    required LatLng origin,
    required LatLng destination,
  }) {
    final originZone = zoneFor(origin);
    final destinationZone = zoneFor(destination);

    return ServiceAreaCheck(
      originZone: originZone == null
          ? null
          : ServiceAreaEndpoint(
              id: originZone.id,
              label: originZone.label,
            ),
      destinationZone: destinationZone == null
          ? null
          : ServiceAreaEndpoint(
              id: destinationZone.id,
              label: destinationZone.label,
            ),
    );
  }

  static ServiceAreaCheck checkPlaceTrip({
    required RamoPlace origin,
    required RamoPlace destination,
  }) {
    return ServiceAreaCheck(
      originZone: endpointForPlace(origin),
      destinationZone: endpointForPlace(destination),
    );
  }
}
