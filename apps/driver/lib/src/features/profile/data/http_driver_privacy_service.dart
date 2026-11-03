import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/driver_core_config.dart';
import 'driver_privacy_service.dart';

class HttpDriverPrivacyService implements DriverPrivacyService {
  HttpDriverPrivacyService({
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
  Future<DriverPrivacyOverview> overview() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/me/privacy'),
          headers: _headers,
        )
        .timeout(DriverCoreConfig.requestTimeout);
    return DriverPrivacyOverview.fromJson(_decode(response));
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
        .timeout(DriverCoreConfig.requestTimeout);
    _decode(response);
  }

  @override
  Future<DriverPrivacyPreferences> updateMarketingNotifications(
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
        .timeout(DriverCoreConfig.requestTimeout);
    return DriverPrivacyPreferences.fromJson(_decode(response));
  }

  @override
  Future<DriverPrivacyRequest> createRequest({
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
        .timeout(DriverCoreConfig.requestTimeout);
    return DriverPrivacyRequest.fromJson(_decode(response));
  }

  Map<String, dynamic> _decode(http.Response response) {
    dynamic decoded;
    try {
      decoded = response.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body);
    } catch (_) {
      throw const DriverPrivacyException(
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
      throw DriverPrivacyException(
        message?.isNotEmpty == true
            ? message!
            : 'Não foi possível acessar suas opções de privacidade agora.',
      );
    }

    return decoded;
  }
}
