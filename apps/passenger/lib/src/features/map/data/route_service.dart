import 'package:latlong2/latlong.dart';

import '../domain/route_info.dart';

abstract interface class RouteService {
  Future<RouteInfo> route({
    required LatLng origin,
    required LatLng destination,
  });
}
