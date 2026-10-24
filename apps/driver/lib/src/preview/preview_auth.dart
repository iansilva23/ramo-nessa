// ignore_for_file: prefer_interpolation_to_compose_strings

import '../core/auth/auth_token_store.dart';
import '../core/auth/phone_auth_service.dart';

class PreviewAuthTokenStore implements AuthTokenStore {
  String? _token;

  @override
  Future<String?> readAccessToken() async => _token;

  @override
  Future<void> saveAccessToken(String token) async {
    _token = token;
  }

  @override
  Future<void> clearAccessToken() async {
    _token = null;
  }
}

class PreviewPhoneAuthService implements PhoneAuthService {
  PreviewPhoneAuthService({required this.subjectType});

  final String subjectType;

  static const previewCode = '123456';

  @override
  Future<RequestedOtp> requestOtp({required String phone}) async {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 10 || digits.length > 13) {
      throw Exception('Digite um celular válido.');
    }

    return RequestedOtp(
      challengeId: 'preview-' + subjectType + '-challenge',
      expiresAt: DateTime.now().add(const Duration(minutes: 10)),
      retryAfterSeconds: 1,
      devCode: previewCode,
    );
  }

  @override
  Future<AuthSession> verifyOtp({
    required String challengeId,
    required String code,
  }) async {
    if (challengeId != 'preview-' + subjectType + '-challenge' ||
        code != previewCode) {
      throw Exception('Código inválido. No Preview, use 123456.');
    }

    return AuthSession(
      accessToken:
          'preview_' + subjectType + '_access_token_12345678901234567890',
      expiresAt: DateTime.now().add(const Duration(days: 7)),
      subjectId: 'preview-' + subjectType,
      subjectType: subjectType,
    );
  }

  @override
  Future<AuthSessionInfo?> currentSession(String accessToken) async {
    if (!accessToken.startsWith(
      'preview_' + subjectType + '_access_token_',
    )) {
      return null;
    }
    return AuthSessionInfo(
      expiresAt: DateTime.now().add(const Duration(days: 7)),
      subjectId: 'preview-' + subjectType,
      subjectType: subjectType,
    );
  }

  @override
  Future<void> logout(String accessToken) async {}
}
