import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../../../core/config/ramo_map_config.dart';
import '../domain/ramo_place.dart';
import 'place_search_service.dart';

class NominatimPlaceSearchService implements PlaceSearchService {
  NominatimPlaceSearchService({http.Client? client})
      : _client = client ?? http.Client();

  final http.Client _client;
  DateTime? _nextAllowedRequestAt;

  @override
  Future<List<RamoPlace>> search(String query) async {
    final normalized = query.trim();
    if (normalized.length < 3) {
      return const [];
    }

    await _respectRateLimit();

    final uri = Uri.https(
      RamoMapConfig.nominatimHost,
      '/search',
      {
        'q': normalized,
        'format': 'jsonv2',
        'limit': '6',
        'countrycodes': 'br',
        'addressdetails': '1',
        'accept-language': 'pt-BR',
      },
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

    final decoded = jsonDecode(response.body);
    if (decoded is! List) {
      throw const FormatException('Resposta de busca inválida.');
    }

    return decoded
        .whereType<Map<String, dynamic>>()
        .map(_parsePlace)
        .whereType<RamoPlace>()
        .toList(growable: false);
  }

  Future<void> _respectRateLimit() async {
    final now = DateTime.now();
    final nextAllowed = _nextAllowedRequestAt;

    if (nextAllowed != null && now.isBefore(nextAllowed)) {
      await Future<void>.delayed(nextAllowed.difference(now));
    }

    _nextAllowedRequestAt =
        DateTime.now().add(const Duration(milliseconds: 1100));
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
