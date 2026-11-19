import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import '../domain/passenger_activity.dart';
import 'passenger_activity_service.dart';

class HttpPassengerActivityService implements PassengerActivityService {
  HttpPassengerActivityService({
    required Uri baseUrl,
    required String accessToken,
    http.Client? client,
  })  : _baseUrl=baseUrl,
        _accessToken=accessToken.trim(),
        _client=client ?? http.Client();

  final Uri _baseUrl;
  final String _accessToken;
  final http.Client _client;

  @override
  Future<PassengerActivitySnapshot> fetch() async {
    final response=await _client.get(
      _baseUrl.resolve('/v1/passenger/me/activity?limit=30'),
      headers:{'authorization':'Bearer $_accessToken'},
    ).timeout(RamoCoreConfig.requestTimeout);

    dynamic decoded;
    try {
      decoded=jsonDecode(response.body);
    } catch (_) {
      throw const FormatException('Resposta de atividade inválida.');
    }

    if (response.statusCode != 200 || decoded is! Map<String,dynamic>) {
      if (decoded is Map<String,dynamic> && decoded['message'] is String) {
        throw StateError(decoded['message'] as String);
      }
      throw StateError('Não foi possível carregar suas corridas agora.');
    }

    return PassengerActivitySnapshot.fromJson(decoded);
  }
}
