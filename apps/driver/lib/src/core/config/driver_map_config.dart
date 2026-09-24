import 'package:latlong2/latlong.dart';

abstract final class DriverMapConfig {
  static const fallbackCenter = LatLng(-2.7956, -40.5142);
  static const fallbackZoom = 14.5;

  static const openFreeMapStyleUrl =
      'https://tiles.openfreemap.org/styles/liberty';

  static const osmTileUrl =
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  static const osrmBaseUrl = 'https://router.project-osrm.org';
  static const requestTimeout = Duration(seconds: 10);

  static const userAgent =
      'RamoNessaDriver/0.1 (br.com.ramonessa.driver)';
}
