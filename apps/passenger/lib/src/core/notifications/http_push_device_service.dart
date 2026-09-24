import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/ramo_core_config.dart';

class PushDeviceRegistrationException implements Exception {
  const PushDeviceRegistrationException(this.message);

  final String message;

  @override
  String toString() => message;
}

class RegisteredPushDevice {
  const RegisteredPushDevice({
    required this.id,
    required this.platform,
    required this.provider,
    required this.enabled,
    required this.updatedAt,
  });

  factory RegisteredPushDevice.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final platform = json['platform'];
    final provider = json['provider'];
    final enabled = json['enabled'];
    final updatedAt = json['updatedAt'];

    if (id is! String ||
        platform is! String ||
        provider is! String ||
        enabled is! bool ||
        updatedAt is! String) {
      throw const FormatException(
        'Cadastro push retornado pelo Core é inválido.',
      );
    }

    return RegisteredPushDevice(
      id: id,
      platform: platform,
      provider: provider,
      enabled: enabled,
      updatedAt: DateTime.parse(updatedAt),
    );
  }

  final String id;
  final String platform;
  final String provider;
  final bool enabled;
  final DateTime updatedAt;
}

class HttpPushDeviceService {
  HttpPushDeviceService({
    required Uri baseUrl,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final http.Client _client;

  Future<RegisteredPushDevice> registerFcmToken({
    required String accessToken,
    required String platform,
    required String token,
  }) async {
    final bearer = accessToken.trim();
    final pushToken = token.trim();
    if (bearer.length < 20 || pushToken.length < 20) {
      throw const PushDeviceRegistrationException(
        'Sessão ou token de notificação inválido.',
      );
    }
    if (platform != 'android' && platform != 'ios') {
      throw const PushDeviceRegistrationException(
        'Plataforma de notificação inválida.',
      );
    }

    final response = await _client
        .put(
          _baseUrl.resolve('/v1/notifications/device'),
          headers: {
            'authorization': 'Bearer $bearer',
            'content-type': 'application/json',
          },
          body: jsonEncode({
            'platform': platform,
            'provider': 'fcm',
            'token': pushToken,
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final payload = _decodeObject(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw PushDeviceRegistrationException(
        payload['message'] is String
            ? payload['message'] as String
            : 'Não foi possível registrar as notificações agora.',
      );
    }

    final device = payload['device'];
    if (device is! Map<String, dynamic>) {
      throw const FormatException(
        'Resposta de cadastro push inválida.',
      );
    }
    return RegisteredPushDevice.fromJson(device);
  }

  Map<String, dynamic> _decodeObject(http.Response response) {
    if (response.body.trim().isEmpty) return <String, dynamic>{};

    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw const FormatException('Resposta inválida do Core.');
    }
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Resposta inválida do Core.');
    }
    return decoded;
  }
}
