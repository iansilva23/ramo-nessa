import 'package:latlong2/latlong.dart';

abstract final class RamoMapConfig {
  static const fallbackCenter = LatLng(-2.7956, -40.5142);
  static const fallbackZoom = 14.5;

  static const osmTileUrl =
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  static const nominatimHost = 'nominatim.openstreetmap.org';
  static const osrmBaseUrl = 'https://router.project-osrm.org';

  static const requestTimeout = Duration(seconds: 10);

  /// Fica desligado até existir um backend confiável fazendo matching.
  static bool get matchingEnabled => false;

  static const userAgent =
      'RamoNessa/0.1 (br.com.ramonessa.ramo_nessa_passenger)';
}
