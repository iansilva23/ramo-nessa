import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../../core/config/ramo_core_config.dart';

class PassengerGrowthException implements Exception {
  const PassengerGrowthException(this.message);
  final String message;
  @override
  String toString() => message;
}

class PassengerGrowthService {
  PassengerGrowthService({required this.baseUrl, required this.accessToken, http.Client? client})
      : _client = client ?? http.Client();
  final Uri baseUrl;
  final String accessToken;
  final http.Client _client;
  Map<String, String> get _headers => {
    'accept': 'application/json', 'content-type': 'application/json',
    'authorization': 'Bearer $accessToken',
  };
  Future<Map<String, dynamic>> _request(String path, {String method = 'GET', Map<String, dynamic>? body}) async {
    final uri = baseUrl.resolve(path);
    final http.Response response;
    try {
      if (method == 'PUT') {
        response = await _client.put(uri, headers: _headers, body: jsonEncode(body)).timeout(RamoCoreConfig.requestTimeout);
      } else if (method == 'POST') {
        response = await _client.post(uri, headers: _headers, body: jsonEncode(body ?? {})).timeout(RamoCoreConfig.requestTimeout);
      } else {
        response = await _client.get(uri, headers: _headers).timeout(RamoCoreConfig.requestTimeout);
      }
    } catch (_) {
      throw const PassengerGrowthException('Não foi possível conectar. Tente novamente.');
    }
    Map<String, dynamic> payload;
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) throw const FormatException();
      payload = decoded;
    } catch (_) {
      throw const PassengerGrowthException('Resposta indisponível. Tente novamente.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw PassengerGrowthException(payload['message'] is String ? payload['message'] as String : 'Não foi possível concluir.');
    }
    return payload;
  }
  Future<Map<String, dynamic>> load() => _request('/v1/passenger/me/marketing');
  Future<void> savePreferences(Map<String, dynamic> preference) async {
    await _request('/v1/passenger/me/marketing/preferences', method: 'PUT', body: preference);
  }
  Future<void> markOpened(String id) async {
    await _request('/v1/passenger/me/marketing/messages/${Uri.encodeComponent(id)}/opened', method: 'POST');
  }
  Future<String> referralCode() async => (await _request('/v1/passenger/me/marketing/referral'))['code'] as String;
  Future<void> applyReferral(String code) async {
    await _request('/v1/passenger/me/marketing/referral', method: 'POST', body: {'code': code.trim()});
  }
  void close() => _client.close();
}
