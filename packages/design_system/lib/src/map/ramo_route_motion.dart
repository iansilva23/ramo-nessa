import 'dart:math' as math;

class RamoMapPoint {
  const RamoMapPoint(this.latitude, this.longitude);

  final double latitude;
  final double longitude;
}

class RamoRouteMotionSample {
  const RamoRouteMotionSample({
    required this.point,
    required this.bearing,
  });

  final RamoMapPoint point;
  final double bearing;
}

/// Movimento de um marcador ao longo da geometria da rota, em vez de uma
/// interpolação reta que corta esquinas entre duas atualizações de GPS.
class RamoRouteMotionPath {
  RamoRouteMotionPath._(this.points)
      : _segmentLengths = _lengths(points),
        totalMeters = _lengths(points).fold(0.0, (sum, item) => sum + item);

  factory RamoRouteMotionPath.between({
    required RamoMapPoint from,
    required RamoMapPoint to,
    required List<RamoMapPoint> route,
    double maxSnapMeters = 120,
  }) {
    if (route.length < 2) return RamoRouteMotionPath._([from, to]);
    final cumulative = <double>[0];
    for (var i = 0; i < route.length - 1; i++) {
      cumulative.add(cumulative.last + _distance(route[i], route[i + 1]));
    }
    final start = _nearestProjection(from, route, cumulative);
    final end = _nearestProjection(to, route, cumulative);
    if (start.distance > maxSnapMeters ||
        end.distance > maxSnapMeters ||
        end.along + 2 < start.along) {
      return RamoRouteMotionPath._([from, to]);
    }
    final path = <RamoMapPoint>[from];
    for (var i = 1; i < route.length - 1; i++) {
      if (cumulative[i] > start.along && cumulative[i] < end.along) {
        path.add(route[i]);
      }
    }
    path.add(to);
    return RamoRouteMotionPath._(_withoutDuplicates(path));
  }

  final List<RamoMapPoint> points;
  final List<double> _segmentLengths;
  final double totalMeters;

  RamoRouteMotionSample sample(double progress) {
    if (points.length == 1) {
      return RamoRouteMotionSample(point: points.first, bearing: 0);
    }
    final target = totalMeters * progress.clamp(0.0, 1.0).toDouble();
    final point = _pointAt(target);
    final look =
        math.max(1.5, math.min(8.0, totalMeters * .025)).toDouble();
    final before = _pointAt(math.max(0, target - look));
    final after = _pointAt(math.min(totalMeters, target + look));
    return RamoRouteMotionSample(
      point: point,
      bearing: _bearing(before, after),
    );
  }

  RamoMapPoint _pointAt(double meters) {
    var traversed = 0.0;
    for (var i = 0; i < _segmentLengths.length; i++) {
      final length = _segmentLengths[i];
      if (meters <= traversed + length || i == _segmentLengths.length - 1) {
        final t = length <= .01
            ? 1.0
            : ((meters - traversed) / length)
                .clamp(0.0, 1.0)
                .toDouble();
        return _lerp(points[i], points[i + 1], t);
      }
      traversed += length;
    }
    return points.last;
  }

  static List<double> _lengths(List<RamoMapPoint> points) => [
        for (var i = 0; i < points.length - 1; i++)
          _distance(points[i], points[i + 1]),
      ];

  static List<RamoMapPoint> _withoutDuplicates(List<RamoMapPoint> points) {
    final result = <RamoMapPoint>[];
    for (final point in points) {
      if (result.isEmpty || _distance(result.last, point) > .25) {
        result.add(point);
      }
    }
    if (result.length == 1) result.add(points.last);
    return result;
  }
}

class _Projection {
  const _Projection(this.along, this.distance);
  final double along;
  final double distance;
}

_Projection _nearestProjection(
  RamoMapPoint point,
  List<RamoMapPoint> route,
  List<double> cumulative,
) {
  var best = const _Projection(0, double.infinity);
  for (var i = 0; i < route.length - 1; i++) {
    final a = route[i];
    final b = route[i + 1];
    final meanLat = (a.latitude + b.latitude + point.latitude) / 3;
    final scale = math.cos(meanLat * math.pi / 180);
    final vx = (b.longitude - a.longitude) * scale;
    final vy = b.latitude - a.latitude;
    final wx = (point.longitude - a.longitude) * scale;
    final wy = point.latitude - a.latitude;
    final denom = vx * vx + vy * vy;
    final t = denom == 0
        ? 0.0
        : ((wx * vx + wy * vy) / denom)
            .clamp(0.0, 1.0)
            .toDouble();
    final projected = _lerp(a, b, t);
    final distance = _distance(point, projected);
    if (distance < best.distance) {
      best = _Projection(
        cumulative[i] + _distance(a, projected),
        distance,
      );
    }
  }
  return best;
}

RamoMapPoint _lerp(RamoMapPoint a, RamoMapPoint b, double t) => RamoMapPoint(
      a.latitude + (b.latitude - a.latitude) * t,
      a.longitude + (b.longitude - a.longitude) * t,
    );

double _distance(RamoMapPoint a, RamoMapPoint b) {
  const radius = 6371000.0;
  final lat1 = a.latitude * math.pi / 180;
  final lat2 = b.latitude * math.pi / 180;
  final dLat = (b.latitude - a.latitude) * math.pi / 180;
  final dLon = (b.longitude - a.longitude) * math.pi / 180;
  final h = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(lat1) * math.cos(lat2) * math.sin(dLon / 2) * math.sin(dLon / 2);
  return radius * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h));
}

double _bearing(RamoMapPoint from, RamoMapPoint to) {
  final lat1 = from.latitude * math.pi / 180;
  final lat2 = to.latitude * math.pi / 180;
  final dLon = (to.longitude - from.longitude) * math.pi / 180;
  final y = math.sin(dLon) * math.cos(lat2);
  final x = math.cos(lat1) * math.sin(lat2) -
      math.sin(lat1) * math.cos(lat2) * math.cos(dLon);
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}
