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
    String? clientInstanceId,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _subjectType = subjectType,
        _clientInstanceId = clientInstanceId?.trim(),
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _subjectType;
  final String? _clientInstanceId;
  final http.Client _client;

  Map<String, String> get _otpHeaders {
    final clientInstanceId = _clientInstanceId;
    return {
      'content-type': 'application/json',
      if (clientInstanceId != null && clientInstanceId.isNotEmpty)
        'x-client-instance-id': clientInstanceId,
    };
  }

  @override
  Future<RequestedOtp> requestOtp({
    required String phone,
    String? email,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/auth/otp/request'),
          headers: _otpHeaders,
          body: jsonEncode({
            'subjectType': _subjectType,
            'phone': phone,
            if (email != null && email.trim().isNotEmpty)
              'email': email.trim(),
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
  Future<RequestedOtp> requestPasswordResetOtp({
    required String phone,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/auth/passenger/password/reset/request'),
          headers: _otpHeaders,
          body: jsonEncode({'phone': phone}),
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
      throw const FormatException('Resposta de recuperação inválida.');
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
          headers: _otpHeaders,
          body: jsonEncode({
            'challengeId': challengeId,
            'code': code,
          }),
        )
        .timeout(const Duration(seconds: 12));
    final json = _decodeObject(response);
    _throwIfError(response, json);

    return _sessionFromJson(json);
  }

  @override
  Future<AuthSession> loginWithPassword({
    required String email,
    required String password,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/auth/passenger/password/login'),
          headers: _otpHeaders,
          body: jsonEncode({
            'email': email.trim(),
            'password': password,
          }),
        )
        .timeout(const Duration(seconds: 12));
    final json = _decodeObject(response);
    _throwIfError(response, json);
    return _sessionFromJson(json);
  }

  @override
  Future<PassengerAccount> passengerAccount(String accessToken) async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/passenger/me/account'),
          headers: {'authorization': 'Bearer ${accessToken.trim()}'},
        )
        .timeout(const Duration(seconds: 10));
    final json = _decodeObject(response);
    _throwIfError(response, json);
    return _accountFromJson(json);
  }

  @override
  Future<PassengerAccount> updatePassengerAccount({
    required String accessToken,
    String? fullName,
    String? email,
    String? password,
  }) async {
    final response = await _client
        .put(
          _baseUrl.resolve('/v1/passenger/me/account'),
          headers: {
            'content-type': 'application/json',
            'authorization': 'Bearer ${accessToken.trim()}',
          },
          body: jsonEncode({
            if (fullName != null) 'fullName': fullName.trim(),
            if (email != null) 'email': email.trim(),
            if (password != null) 'password': password,
          }),
        )
        .timeout(const Duration(seconds: 12));
    final json = _decodeObject(response);
    _throwIfError(response, json);
    return _accountFromJson(json);
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
      email: json['email'] as String?,
      fullName: json['fullName'] as String?,
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

  AuthSession _sessionFromJson(Map<String, dynamic> json) {
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

  PassengerAccount _accountFromJson(Map<String, dynamic> json) {
    final subjectId = json['subjectId'];
    final phoneE164 = json['phoneE164'];
    if (subjectId is! String || phoneE164 is! String) {
      throw const FormatException('Conta de passageiro inválida.');
    }
    return PassengerAccount(
      subjectId: subjectId,
      phoneE164: phoneE164,
      email: json['email'] as String?,
      fullName: json['fullName'] as String?,
      photoUrl: json['photoUrl'] as String?,
    );
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
