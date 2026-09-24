import 'package:latlong2/latlong.dart';

abstract final class RamoMapConfig {
  static const fallbackCenter = LatLng(-2.7956, -40.5142);
  static const fallbackZoom = 14.5;

  static const openFreeMapStyleUrl =
      'https://tiles.openfreemap.org/styles/liberty';

  static const osmTileUrl =
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  static const nominatimHost = 'nominatim.openstreetmap.org';
  static const osrmBaseUrl = 'https://router.project-osrm.org';

  /// Recorte operacional de busca do MVP: Jeri, Jijoca, Preá e entorno.
  ///
  /// Nominatim usa a ordem left,top,right,bottom.
  static const nominatimViewbox = '-40.61,-2.73,-40.34,-2.98';

  static const requestTimeout = Duration(seconds: 10);

  /// Fica desligado até existir um backend confiável fazendo matching.
  static bool get matchingEnabled => false;

  static const userAgent =
      'RamoNessa/0.1 (br.com.ramonessa.passenger)';
}
