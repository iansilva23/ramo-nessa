import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../../../core/config/ramo_map_config.dart';
import '../../service_area/domain/approved_destination_catalog.dart';
import '../domain/ramo_place.dart';
import 'place_search_service.dart';

class NominatimPlaceSearchService implements PlaceSearchService {
  NominatimPlaceSearchService({http.Client? client})
      : _client = client ?? http.Client();

  static const _maxCacheEntries = 50;

  final http.Client _client;
  final Map<String, List<RamoPlace>> _cache = {};
  DateTime? _nextAllowedRequestAt;
  Future<void> _rateLimitQueue = Future<void>.value();

  @override
  Future<List<RamoPlace>> search(String query) async {
    final normalized = query.trim();
    if (normalized.length < 3) {
      return const [];
    }

    final cacheKey = normalized.toLowerCase();
    final cached = _cache[cacheKey];
    if (cached != null) {
      return cached;
    }

    final approvedExternal =
        ApprovedDestinationCatalog.matchQuery(normalized);

    await _respectRateLimit();

    final results = approvedExternal == null
        ? await _request(
            query: normalized,
            boundedToLocalArea: true,
          )
        : await _request(
            query: '${approvedExternal.label}, Ceará, Brasil',
            boundedToLocalArea: false,
          );

    final safeResults = approvedExternal == null
        ? results
        : results
            .where(
              (place) =>
                  ApprovedDestinationCatalog.matchPlace(place)?.id ==
                  approvedExternal.id,
            )
            .toList(growable: false);

    if (!_cache.containsKey(cacheKey) &&
        _cache.length >= _maxCacheEntries &&
        _cache.isNotEmpty) {
      _cache.remove(_cache.keys.first);
    }
    _cache[cacheKey] = safeResults;
    return safeResults;
  }

  Future<List<RamoPlace>> _request({
    required String query,
    required bool boundedToLocalArea,
  }) async {
    final parameters = <String, String>{
      'q': query,
      'format': 'jsonv2',
      'limit': '6',
      'countrycodes': 'br',
      'addressdetails': '1',
      'accept-language': 'pt-BR',
      if (boundedToLocalArea) ...{
        'viewbox': RamoMapConfig.nominatimViewbox,
        'bounded': '1',
      },
    };

    final uri = Uri.https(
      RamoMapConfig.nominatimHost,
      '/search',
      parameters,
    );

    final response = await _client
        .get(
          uri,
          headers: const {
            'User-Agent': RamoMapConfig.userAgent,
            'Accept': 'application/json',
            'Accept-Language': 'pt-BR,pt;q=0.9',
          },
        )
        .timeout(RamoMapConfig.requestTimeout);

    if (response.statusCode != 200) {
      throw StateError(
        'Não foi possível buscar destinos agora (HTTP ${response.statusCode}).',
      );
    }

    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw const FormatException('Resposta de busca inválida.');
    }
    if (decoded is! List) {
      throw const FormatException('Resposta de busca inválida.');
    }

    return decoded
        .whereType<Map<String, dynamic>>()
        .map(_parsePlace)
        .whereType<RamoPlace>()
        .toList(growable: false);
  }

  Future<void> _respectRateLimit() {
    final scheduled = _rateLimitQueue.then((_) async {
      final now = DateTime.now();
      final nextAllowed = _nextAllowedRequestAt;

      if (nextAllowed != null && now.isBefore(nextAllowed)) {
        await Future<void>.delayed(nextAllowed.difference(now));
      }

      _nextAllowedRequestAt =
          DateTime.now().add(const Duration(milliseconds: 1100));
    });

    _rateLimitQueue = scheduled;
    return scheduled;
  }

  RamoPlace? _parsePlace(Map<String, dynamic> item) {
    final lat = double.tryParse(item['lat']?.toString() ?? '');
    final lon = double.tryParse(item['lon']?.toString() ?? '');
    final address = item['display_name']?.toString().trim() ?? '';

    if (lat == null || lon == null || address.isEmpty) {
      return null;
    }

    final rawName = item['name']?.toString().trim();
    final name = rawName == null || rawName.isEmpty
        ? address.split(',').first.trim()
        : rawName;

    return RamoPlace(
      name: name,
      address: address,
      position: LatLng(lat, lon),
    );
  }
}
