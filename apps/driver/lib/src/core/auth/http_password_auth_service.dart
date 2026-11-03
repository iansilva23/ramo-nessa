import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;

import 'password_auth_service.dart';
import 'driver_password_auth_service.dart';
import 'session_http_client.dart';

class AuthHttpException implements Exception {
  const AuthHttpException({
    required this.statusCode,
    required this.code,
    required this.message,
  });

  final int statusCode;
  final String code;
  final String message;

  @override
  String toString() => message;
}

class HttpPasswordAuthService
    implements PasswordAuthService, DriverPasswordAuthService {
  HttpPasswordAuthService({
    required Uri baseUrl,
    required String subjectType,
    String? clientInstanceId,
    http.Client? client,
    this.readOnlySessionCheck = kIsWeb,
    this.browserSession = kIsWeb,
  }) : _baseUrl = baseUrl,
       _subjectType = subjectType,
       _clientInstanceId = clientInstanceId?.trim(),
       _client = client ?? createSessionHttpClient(subjectType);

  final Uri _baseUrl;
  final String _subjectType;
  final String? _clientInstanceId;
  final http.Client _client;
  // Web checks are passive; native session renewal remains unchanged.
  final bool readOnlySessionCheck;
  final bool browserSession;

  Map<String, String> get _authHeaders {
    final clientInstanceId = _clientInstanceId;
    return {
      'content-type': 'application/json',
      if (browserSession) 'x-ramo-web-role': _subjectType,
      if (clientInstanceId != null && clientInstanceId.isNotEmpty)
        'x-client-instance-id': clientInstanceId,
    };
  }

  AuthSession _session(Map<String, dynamic> json) {
    final token = json['accessToken'];
    final expiresAt = json['expiresAt'];
    final subjectId = json['subjectId'];
    final subjectType = json['subjectType'];
    if (token is! String ||
        expiresAt is! String ||
        subjectId is! String ||
        subjectType is! String) {
      throw const FormatException('Sessão autenticada inválida.');
    }

    if (browserSession &&
        (subjectType != _subjectType ||
            !RegExp('^ramo_web_${_subjectType}_v1_[a-f0-9]{32}\$')
                .hasMatch(token))) {
      throw const FormatException('Sessão Web não configurada no servidor.');
    }
    return AuthSession(
      accessToken: token,
      expiresAt: DateTime.parse(expiresAt),
      subjectId: subjectId,
      subjectType: subjectType,
    );
  }

  @override
  Future<AuthSessionInfo?> currentSession(String accessToken) async {
    final response = await _client
        .get(
          _baseUrl.resolve(
            readOnlySessionCheck ? '/v1/auth/me/check' : '/v1/auth/me',
          ),
          headers: {'authorization': 'Bearer ${accessToken.trim()}'},
        )
        .timeout(const Duration(seconds: 10));

    if (response.statusCode == 401 || response.statusCode == 403) {
      return null;
    }

    final json = _decodeObject(response);
    _throwIfError(response, json);

    final expiresAt = json['expiresAt'];
    final subjectId = json['subjectId'];
    final subjectType = json['subjectType'];
    if (expiresAt is! String ||
        subjectId is! String ||
        subjectType is! String) {
      throw const FormatException('Sessão atual inválida.');
    }

    return AuthSessionInfo(
      expiresAt: DateTime.parse(expiresAt),
      subjectId: subjectId,
      subjectType: subjectType,
    );
  }

  @override
  Future<void> logout(String accessToken) async {
    final response = await _client
        .delete(
          _baseUrl.resolve('/v1/auth/session'),
          headers: {'authorization': 'Bearer ${accessToken.trim()}'},
        )
        .timeout(const Duration(seconds: 10));
    if (response.statusCode == 204 ||
        response.statusCode == 401 ||
        response.statusCode == 403) {
      return;
    }

    final json = _decodeObject(response);
    _throwIfError(response, json);
    throw const FormatException('Resposta de logout inválida.');
  }

  Future<Map<String, dynamic>> _passwordRequest(
    String path,
    Map<String, dynamic> body, {
    String? token,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve(path),
          headers: {
            ..._authHeaders,
            if (token != null) 'authorization': 'Bearer ${token.trim()}',
          },
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 12));
    final value = _decodeObject(response);
    _throwIfError(response, value);
    return value;
  }

  @override
  Future<AuthSession> loginWithPassword({
    required String identifier,
    required String password,
  }) async {
    return _session(
      await _passwordRequest('/v1/auth/driver/password/login', {
        'identifier': identifier,
        'password': password,
      }),
    );
  }

  @override
  Future<DriverLoginCredentials> loginCredentials(String accessToken) async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/driver/me/login-credentials'),
          headers: {
            ..._authHeaders,
            'authorization': 'Bearer ${accessToken.trim()}',
          },
        )
        .timeout(const Duration(seconds: 12));
    final value = _decodeObject(response);
    _throwIfError(response, value);
    if (value['configured'] is! bool ||
        (value['configured'] == true &&
            (value['username'] is! String || value['email'] is! String))) {
      throw const FormatException('Configuração de acesso inválida.');
    }
    return DriverLoginCredentials(
      configured: value['configured'] as bool,
      username: value['username'] as String?,
      email: value['email'] as String?,
    );
  }

  @override
  Future<void> createLoginCredentials({
    required String accessToken,
    required String username,
    required String email,
    required String password,
  }) async {
    final value = await _passwordRequest('/v1/driver/me/login-credentials', {
      'username': username,
      'email': email,
      'password': password,
    }, token: accessToken);
    if (value['configured'] != true) {
      throw const FormatException(
        'A configuração do acesso não foi confirmada.',
      );
    }
  }

  @override
  Future<AuthSession> registerWithPassword({
    required String fullName,
    required String phone,
    required String email,
    required String password,
    String? username,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/auth/driver/password/register'),
          headers: _authHeaders,
          body: jsonEncode({
            'fullName': fullName,
            'phone': phone,
            'email': email,
            'password': password,
            if (username != null) 'username': username,
          }),
        )
        .timeout(const Duration(seconds: 12));
    final value = _decodeObject(response);
    _throwIfError(response, value);
    return _session(value);
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

  void _throwIfError(http.Response response, Map<String, dynamic> json) {
    if (response.statusCode >= 200 && response.statusCode < 300) return;

    throw AuthHttpException(
      statusCode: response.statusCode,
      code: json['error'] is String ? json['error'] as String : 'AUTH_ERROR',
      message: json['message'] is String
          ? json['message'] as String
          : 'Não foi possível autenticar agora.',
    );
  }
}
