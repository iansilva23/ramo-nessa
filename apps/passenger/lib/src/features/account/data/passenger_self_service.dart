import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import '../domain/passenger_account_models.dart';

class PassengerSelfServiceException implements Exception {
  const PassengerSelfServiceException(this.message);

  final String message;

  @override
  String toString() => message;
}

abstract interface class PassengerSelfService {
  Future<PassengerAccountSnapshot> account();
  Future<PassengerActivitySnapshot> activity();
}

class HttpPassengerSelfService implements PassengerSelfService {
  HttpPassengerSelfService({
    required Uri baseUrl,
    required String accessToken,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _accessToken = accessToken,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _accessToken;
  final http.Client _client;

  Map<String, String> get _headers => {
        'authorization': 'Bearer ${_accessToken.trim()}',
        'accept': 'application/json',
      };

  @override
  Future<PassengerAccountSnapshot> account() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/passenger/me/account'),
          headers: _headers,
        )
        .timeout(RamoCoreConfig.requestTimeout);
    return PassengerAccountSnapshot.fromJson(
      _expectObject(response),
    );
  }

  @override
  Future<PassengerActivitySnapshot> activity() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/passenger/me/activity?limit=30'),
          headers: _headers,
        )
        .timeout(RamoCoreConfig.requestTimeout);
    return PassengerActivitySnapshot.fromJson(
      _expectObject(response),
    );
  }

  Map<String, dynamic> _expectObject(http.Response response) {
    dynamic decoded;
    try {
      decoded = response.body.trim().isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body);
    } catch (_) {
      throw const PassengerSelfServiceException(
        'O servidor retornou uma resposta inválida.',
      );
    }

    if (response.statusCode == 200 && decoded is Map<String, dynamic>) {
      return decoded;
    }

    if (decoded is Map<String, dynamic>) {
      throw PassengerSelfServiceException(
        decoded['message'] as String? ??
            'Não foi possível carregar sua conta agora.',
      );
    }

    throw const PassengerSelfServiceException(
      'Não foi possível carregar sua conta agora.',
    );
  }
}
