import 'dart:math' as math;

/// Read-only projection onto the route already loaded by the app. No requests.
class RamoNotificationJourney {
  String? _key;
  List<({double latitude, double longitude})> _points = const [];
  Duration? _duration;

  void clear() {
    _key = null;
    _points = const [];
    _duration = null;
  }

  ({double progress, String eta})? sample({
    required String key,
    required Iterable<({double latitude, double longitude})> points,
    required double latitude,
    required double longitude,
    required DateTime positionAt,
    required DateTime now,
    Duration? duration,
  }) {
    if (_key != key) {
      clear();
      _key = key;
    }
    final age = now.difference(positionAt);
    if (!_valid(latitude, longitude) ||
        age > const Duration(seconds: 45) ||
        age < const Duration(seconds: -15)) {
      return null;
    }
    if (_points.isEmpty) {
      final available = points.take(10001).toList();
      if (available.length < 2 || available.length > 10000 ||
          available.any((p) => !_valid(p.latitude, p.longitude))) {
        return null;
      }
      _points = available;
      _duration = duration;
    }
    const meters = 111195.0;
    final scale = math.cos(latitude * math.pi / 180);
    var total = 0.0;
    var along = 0.0;
    var closest = double.infinity;
    for (var i = 1; i < _points.length; i++) {
      final a = _points[i - 1];
      final b = _points[i];
      final ax = (a.longitude - longitude) * meters * scale;
      final ay = (a.latitude - latitude) * meters;
      final dx = (b.longitude - a.longitude) * meters * scale;
      final dy = (b.latitude - a.latitude) * meters;
      final squared = dx * dx + dy * dy;
      final length = math.sqrt(squared);
      final t = squared == 0 ? 0.0 : (-(ax * dx + ay * dy) / squared).clamp(0.0, 1.0).toDouble();
      final distance = math.sqrt(math.pow(ax + t * dx, 2) + math.pow(ay + t * dy, 2));
      if (distance < closest) {
        closest = distance;
        along = total + length * t;
      }
      total += length;
    }
    if (closest > 150 || total < 5) {
      return null;
    }
    final progress = (along / total).clamp(0.0, 1.0).toDouble();
    final seconds = _duration?.inSeconds;
    var eta = '';
    if (seconds != null && seconds > 0 && seconds <= 86400) {
      final arrival = now.add(Duration(seconds: (seconds * (1 - progress)).round())).toLocal();
      eta = 'Chegada estimada: ${arrival.hour.toString().padLeft(2, '0')}:${arrival.minute.toString().padLeft(2, '0')}';
    }
    return (progress: (progress * 100).round() / 100, eta: eta);
  }

  static bool _valid(double latitude, double longitude) =>
      latitude.isFinite && longitude.isFinite &&
      latitude.abs() <= 90 && longitude.abs() <= 180 &&
      (latitude != 0 || longitude != 0);
}
