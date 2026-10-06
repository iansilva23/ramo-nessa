import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import 'passenger_support_service.dart';

class HttpPassengerSupportService implements PassengerSupportService {
  HttpPassengerSupportService({
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
  Future<List<PassengerSupportTicket>> listTickets() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/passenger/me/support'),
          headers: _headers,
        )
        .timeout(RamoCoreConfig.requestTimeout);
    final payload = _decode(response);
    final tickets = payload['tickets'];
    if (tickets is! List) {
      throw const PassengerSupportException(
        'Resposta de suporte inválida.',
      );
    }
    return tickets
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .map(PassengerSupportTicket.fromJson)
        .toList(growable: false);
  }

  @override
  Future<PassengerSupportTicket> createTicket({
    required String category,
    required String subject,
    required String message,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/passenger/me/support'),
          headers: _headers,
          body: jsonEncode({
            'category': category,
            'subject': subject,
            'message': message,
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);
    return PassengerSupportTicket.fromJson(_decode(response));
  }

  Map<String, dynamic> _decode(http.Response response) {
    dynamic decoded;
    try {
      decoded = response.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body);
    } catch (_) {
      throw const PassengerSupportException(
        'Resposta de suporte inválida.',
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
      throw PassengerSupportException(
        message?.isNotEmpty == true
            ? message!
            : 'Não foi possível acessar o suporte agora.',
      );
    }
    return decoded;
  }
}
