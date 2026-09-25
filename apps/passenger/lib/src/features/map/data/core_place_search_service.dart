import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../../../core/config/ramo_core_config.dart';
import '../../service_area/domain/approved_destination_catalog.dart';
import '../domain/ramo_place.dart';
import 'place_autocomplete_service.dart';
import 'place_search_service.dart';

class CorePlaceSearchService
    implements PlaceSearchService, PlaceAutocompleteService {
  CorePlaceSearchService({
    required Uri baseUrl,
    String? accessToken,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _accessToken = accessToken?.trim() ?? '',
        _client = client ?? http.Client();

  static const _maxCacheEntries = 50;
  static final Random _secureRandom = Random.secure();

  final Uri _baseUrl;
  final String _accessToken;
  final http.Client _client;
  final Map<String, List<RamoPlace>> _cache = {};

  Map<String, String> get _headers => {
        'content-type': 'application/json',
        'accept': 'application/json',
        if (_accessToken.isNotEmpty)
          'authorization': 'Bearer $_accessToken',
      };

  @override
  String beginSession() {
    final bytes = List<int>.generate(
      16,
      (_) => _secureRandom.nextInt(256),
      growable: false,
    );
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    final hex = bytes
        .map((value) => value.toRadixString(16).padLeft(2, '0'))
        .join();
    return '${hex.substring(0, 8)}-'
        '${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-'
        '${hex.substring(16, 20)}-'
        '${hex.substring(20)}';
  }

  ApprovedExternalDestination? _approvedExternalForAutocomplete(
    String query,
  ) {
    final exact = ApprovedDestinationCatalog.matchQuery(query);
    if (exact != null) return exact;

    final normalized = ApprovedDestinationCatalog.normalize(query);
    if (normalized.length < 3) return null;

    final matches = ApprovedDestinationCatalog.destinations
        .where(
          (destination) => destination.aliases.any(
            (alias) => ApprovedDestinationCatalog
                .normalize(alias)
                .startsWith(normalized),
          ),
        )
        .toList(growable: false);

    return matches.length == 1 ? matches.single : null;
  }

  @override
  Future<List<PlaceAutocompleteSuggestion>> suggestions(
    String query, {
    required String sessionToken,
  }) async {
    final normalized = query.trim();
    if (normalized.length < 3) return const [];

    final approvedExternal =
        _approvedExternalForAutocomplete(normalized);
    final queryForProvider = approvedExternal == null
        ? normalized
        : '${approvedExternal.label}, Ceará, Brasil';

    final response = await _client
        .post(
          _baseUrl.resolve('/v1/maps/places/autocomplete'),
          headers: _headers,
          body: jsonEncode({
            'input': queryForProvider,
            'sessionToken': sessionToken,
            'localOnly': approvedExternal == null,
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw const FormatException(
        'Resposta de sugestões inválida.',
      );
    }

    if (response.statusCode != 200 || decoded is! Map<String, dynamic>) {
      final message = decoded is Map
          ? decoded['message']?.toString().trim()
          : null;
      throw StateError(
        message?.isNotEmpty == true
            ? message!
            : 'Não foi possível sugerir destinos agora.',
      );
    }

    final rawSuggestions = decoded['suggestions'];
    if (rawSuggestions is! List) {
      throw const FormatException(
        'Resposta de sugestões inválida.',
      );
    }

    return rawSuggestions
        .whereType<Map>()
        .map((raw) => Map<String, dynamic>.from(raw))
        .map((raw) {
          final placeId = raw['placeId']?.toString().trim() ?? '';
          final mainText = raw['mainText']?.toString().trim() ?? '';
          final secondaryText =
              raw['secondaryText']?.toString().trim() ?? '';
          if (placeId.isEmpty || mainText.isEmpty) return null;

          return PlaceAutocompleteSuggestion(
            placeId: placeId,
            mainText: mainText,
            secondaryText: secondaryText,
            localOnly: approvedExternal == null,
            approvedExternalId: approvedExternal?.id,
          );
        })
        .whereType<PlaceAutocompleteSuggestion>()
        .toList(growable: false);
  }

  @override
  Future<RamoPlace> resolve(
    PlaceAutocompleteSuggestion suggestion, {
    required String sessionToken,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/maps/places/details'),
          headers: _headers,
          body: jsonEncode({
            'placeId': suggestion.placeId,
            'sessionToken': sessionToken,
            'localOnly': suggestion.localOnly,
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw const FormatException(
        'Resposta de lugar inválida.',
      );
    }

    if (response.statusCode != 200 || decoded is! Map<String, dynamic>) {
      final message = decoded is Map
          ? decoded['message']?.toString().trim()
          : null;
      throw StateError(
        message?.isNotEmpty == true
            ? message!
            : 'Não foi possível abrir esse destino agora.',
      );
    }

    final rawPlace = decoded['place'];
    if (rawPlace is! Map) {
      throw const FormatException('Resposta de lugar inválida.');
    }

    final raw = Map<String, dynamic>.from(rawPlace);
    final address = raw['address']?.toString().trim() ?? '';
    final latitude = raw['latitude'];
    final longitude = raw['longitude'];
    if (
      address.isEmpty ||
      latitude is! num ||
      longitude is! num
    ) {
      throw const FormatException('Resposta de lugar inválida.');
    }

    final place = RamoPlace(
      name: suggestion.mainText,
      address: address,
      position: LatLng(
        latitude.toDouble(),
        longitude.toDouble(),
      ),
    );

    final approvedExternalId = suggestion.approvedExternalId;
    if (
      approvedExternalId != null &&
      ApprovedDestinationCatalog.matchPlace(place)?.id !=
          approvedExternalId
    ) {
      throw StateError(
        'Esse resultado não corresponde ao destino externo aprovado.',
      );
    }

    return place;
  }

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
          headers: _headers,
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
