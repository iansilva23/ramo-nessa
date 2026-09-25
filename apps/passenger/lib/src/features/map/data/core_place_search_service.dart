import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../../../core/config/ramo_core_config.dart';
import '../../service_area/domain/approved_destination_catalog.dart';
import '../domain/ramo_place.dart';
import 'place_search_service.dart';

class CorePlaceSearchService implements PlaceSearchService {
  CorePlaceSearchService({
    required Uri baseUrl,
    String? accessToken,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _accessToken = accessToken?.trim() ?? '',
        _client = client ?? http.Client();

  static const _maxCacheEntries = 50;

  final Uri _baseUrl;
  final String _accessToken;
  final http.Client _client;
  final Map<String, List<RamoPlace>> _cache = {};

  @override
  Future<List<RamoPlace>> search(String query) async {
    final normalized = query.trim();
    if (normalized.length < 3) return const [];

    final cacheKey = normalized.toLowerCase();
    final cached = _cache[cacheKey];
    if (cached != null) return cached;

    final approvedExternal =
        ApprovedDestinationCatalog.matchQuery(normalized);
    final queryForProvider = approvedExternal == null
        ? normalized
        : '${approvedExternal.label}, Ceará, Brasil';

    final response = await _client
        .post(
          _baseUrl.resolve('/v1/maps/places/search'),
          headers: {
            'content-type': 'application/json',
            'accept': 'application/json',
            if (_accessToken.isNotEmpty)
              'authorization': 'Bearer $_accessToken',
          },
          body: jsonEncode({
            'query': queryForProvider,
            'localOnly': approvedExternal == null,
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw const FormatException('Resposta de busca inválida.');
    }

    if (response.statusCode != 200 || decoded is! Map<String, dynamic>) {
      final message = decoded is Map
          ? decoded['message']?.toString().trim()
          : null;
      throw StateError(
        message?.isNotEmpty == true
            ? message!
            : 'Não foi possível buscar destinos agora.',
      );
    }

    final rawPlaces = decoded['places'];
    if (rawPlaces is! List) {
      throw const FormatException('Resposta de busca inválida.');
    }

    final results = rawPlaces
        .whereType<Map>()
        .map((raw) => Map<String, dynamic>.from(raw))
        .map(_parsePlace)
        .whereType<RamoPlace>()
        .toList(growable: false);

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

  RamoPlace? _parsePlace(Map<String, dynamic> raw) {
    final name = raw['name']?.toString().trim() ?? '';
    final address = raw['address']?.toString().trim() ?? '';
    final latitude = raw['latitude'];
    final longitude = raw['longitude'];

    if (
      name.isEmpty ||
      address.isEmpty ||
      latitude is! num ||
      longitude is! num
    ) {
      return null;
    }

    return RamoPlace(
      name: name,
      address: address,
      position: LatLng(
        latitude.toDouble(),
        longitude.toDouble(),
      ),
    );
  }
}
