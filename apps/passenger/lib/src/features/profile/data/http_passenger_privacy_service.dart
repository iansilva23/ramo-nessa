import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import 'passenger_privacy_service.dart';

class HttpPassengerPrivacyService implements PassengerPrivacyService {
  HttpPassengerPrivacyService({
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
        'accept': 'application/json',
        'content-type': 'application/json',
        'authorization': 'Bearer $_accessToken',
      };

  @override
  Future<PassengerPrivacyOverview> overview() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/me/privacy'),
          headers: _headers,
        )
        .timeout(RamoCoreConfig.requestTimeout);
    return PassengerPrivacyOverview.fromJson(_decode(response));
  }

  @override
  Future<void> acceptLegalDocument({
    required String documentType,
    required int version,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/me/privacy/legal-acceptances'),
          headers: _headers,
          body: jsonEncode({
            'documentType': documentType,
            'version': version,
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);
    _decode(response);
  }

  @override
  Future<PassengerPrivacyPreferences> updateMarketingNotifications(
    bool enabled,
  ) async {
    final response = await _client
        .patch(
          _baseUrl.resolve('/v1/me/privacy/preferences'),
          headers: _headers,
          body: jsonEncode({
            'marketingNotificationsEnabled': enabled,
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);
    return PassengerPrivacyPreferences.fromJson(_decode(response));
  }

  @override
  Future<PassengerPrivacyRequest> createRequest({
    required String requestType,
    String? note,
  }) async {
    final normalizedNote = note?.trim();
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/me/privacy/requests'),
          headers: _headers,
          body: jsonEncode({
            'requestType': requestType,
            if (normalizedNote?.isNotEmpty == true)
              'note': normalizedNote,
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);
    return PassengerPrivacyRequest.fromJson(_decode(response));
  }

  Map<String, dynamic> _decode(http.Response response) {
    dynamic decoded;
    try {
      decoded = response.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body);
    } catch (_) {
      throw const PassengerPrivacyException(
        'Resposta de privacidade inválida.',
      );
    }

    if (
      response.statusCode < 200 ||
      response.statusCode >= 300 ||
      decoded is! Map<String, dynamic>
    ) {
      final message = decoded is Map
          ? decoded['message']?.toString().trim()
          : null;
      throw PassengerPrivacyException(
        message?.isNotEmpty == true
            ? message!
            : 'Não foi possível acessar suas opções de privacidade agora.',
      );
    }
    return decoded;
  }
}
