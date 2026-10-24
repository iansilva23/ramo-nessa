import 'dart:convert';
import 'package:http/http.dart' as http;

abstract interface class DriverRegistrationService {
  Future<Map<String, dynamic>> status();
  Future<Map<String, dynamic>> submit(Map<String, dynamic> data);
}

class HttpDriverRegistrationService implements DriverRegistrationService {
  HttpDriverRegistrationService({required this.baseUrl, required this.accessToken, http.Client? client})
      : _client = client ?? http.Client();
  final Uri baseUrl;
  final String accessToken;
  final http.Client _client;
  Map<String, String> get _headers => {'content-type': 'application/json', 'authorization': 'Bearer $accessToken'};

  @override
  Future<Map<String, dynamic>> status() async => _decode(await _client.get(
    baseUrl.resolve('/v1/driver/me/registration'), headers: _headers,
  ).timeout(const Duration(seconds: 15)));

  @override
  Future<Map<String, dynamic>> submit(Map<String, dynamic> data) async => _decode(await _client.post(
    baseUrl.resolve('/v1/driver/me/registration'), headers: _headers, body: jsonEncode(data),
  ).timeout(const Duration(seconds: 15)));

  Map<String, dynamic> _decode(http.Response response) {
    Map<String, dynamic>? data;
    try { final decoded = jsonDecode(response.body); if (decoded is Map<String, dynamic>) data = decoded; } catch (_) {}
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw DriverRegistrationException(data?['message'] as String? ?? 'Não conseguimos carregar o cadastro. Tente novamente.');
    }
    if (data == null || !['approved', 'pending', 'incomplete', 'suspended'].contains(data['status'])) {
      throw const DriverRegistrationException('Resposta do cadastro inválida. Tente novamente.');
    }
    return data;
  }
}

class DriverRegistrationException implements Exception {
  const DriverRegistrationException(this.message);
  final String message;
  @override
  String toString() => message;
}
