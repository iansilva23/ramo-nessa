import 'package:latlong2/latlong.dart';
import '../../service_area/domain/service_zone.dart';

/// All passenger platforms consume the published server catalog.
/// Legacy configuration remains available when management mode is disabled.
abstract final class ManagedPricingCatalog {
  static bool _enabled = false;
  static List<ServiceZone> _zones = const [];
  static Map<String, Map<String, String>> _presentation = const {};

  static bool get enabled => _enabled;
  static List<ServiceZone>? get zones => enabled ? _zones : null;

  static void update({
    required bool enabled,
    required List<ServiceZone>? zones,
    required dynamic categories,
  }) {
    _enabled = enabled;
    _zones = enabled ? List.unmodifiable(zones ?? const <ServiceZone>[]) : const [];
    final entries = <String, Map<String, String>>{};
    if (enabled && categories is List) {
      for (final category in categories.whereType<Map>()) {
        final id = category['id'];
        if (id is! String) continue;
        entries[id] = {
          for (final key in ['name', 'description', 'icon'])
            if (category[key] is String) key: category[key] as String,
        };
      }
    }
    _presentation = Map.unmodifiable(entries);
  }

  static String? presentation(String category, String key) {
    if (!enabled) return null;
    final categoryPresentation = _presentation[category];
    return categoryPresentation == null ? null : categoryPresentation[key];
  }

  static ServiceZone? zoneFor(LatLng point) {
    if (!enabled) return null;
    final candidates = _zones.where((zone) => zone.contains(point)).toList();
    candidates.sort((a, b) {
      final radius = a.radiusMeters.compareTo(b.radiusMeters);
      if (radius != 0) return radius;
      final proximity = (a.distanceTo(point) / a.radiusMeters)
          .compareTo(b.distanceTo(point) / b.radiusMeters);
      if (proximity != 0) return proximity;
      final zone = a.id.compareTo(b.id);
      return zone != 0
          ? zone
          : (a.localityId ?? a.id).compareTo(b.localityId ?? b.id);
    });
    return candidates.isEmpty ? null : candidates.first;
  }
}
