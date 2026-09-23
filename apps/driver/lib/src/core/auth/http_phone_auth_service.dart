import 'dart:convert';

import 'package:http/http.dart' as http;

import 'phone_auth_service.dart';

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

class HttpPhoneAuthService implements PhoneAuthService {
  HttpPhoneAuthService({
    required Uri baseUrl,
    required String subjectType,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _subjectType = subjectType,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _subjectType;
  final http.Client _client;

  @override
  Future<RequestedOtp> requestOtp(String phone) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/auth/otp/request'),
          headers: const {'content-type': 'application/json'},
          body: jsonEncode({
            'subjectType': _subjectType,
            'phone': phone,
          }),
        )
        .timeout(const Duration(seconds: 12));
    final json = _decodeObject(response);
    _throwIfError(response, json);

    final challengeId = json['challengeId'];
    final expiresAt = json['expiresAt'];
    final retryAfterSeconds = json['retryAfterSeconds'];
    if (challengeId is! String ||
        expiresAt is! String ||
        retryAfterSeconds is! num) {
      throw const FormatException('Resposta de OTP inválida.');
    }

    return RequestedOtp(
      challengeId: challengeId,
      expiresAt: DateTime.parse(expiresAt),
      retryAfterSeconds: retryAfterSeconds.toInt(),
      devCode: json['devCode'] is String ? json['devCode'] as String : null,
    );
  }

  @override
  Future<AuthSession> verifyOtp({
    required String challengeId,
    required String code,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/auth/otp/verify'),
          headers: const {'content-type': 'application/json'},
          body: jsonEncode({
            'challengeId': challengeId,
            'code': code,
          }),
        )
        .timeout(const Duration(seconds: 12));
    final json = _decodeObject(response);
    _throwIfError(response, json);

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
          _baseUrl.resolve('/v1/auth/me'),
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
    if (
      response.statusCode == 204 ||
      response.statusCode == 401 ||
      response.statusCode == 403
    ) {
      return;
    }

    final json = _decodeObject(response);
    _throwIfError(response, json);
    throw const FormatException('Resposta de logout inválida.');
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

  void _throwIfError(
    http.Response response,
    Map<String, dynamic> json,
  ) {
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
