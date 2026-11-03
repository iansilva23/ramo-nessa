// ignore_for_file: prefer_interpolation_to_compose_strings

import '../core/auth/auth_token_store.dart';
import '../core/auth/password_auth_service.dart';

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

class PreviewPasswordAuthService implements PasswordAuthService {
  PreviewPasswordAuthService({required this.subjectType});

  final String subjectType;

  @override
  Future<AuthSession> registerWithPassword({
    required String fullName,
    required String phone,
    required String email,
    required String password,
    String? username,
  }) async => AuthSession(
    accessToken:
        'preview_' + subjectType + '_access_token_12345678901234567890',
    expiresAt: DateTime.now().add(const Duration(days: 7)),
    subjectId: 'preview-' + subjectType,
    subjectType: subjectType,
  );
  @override
  Future<AuthSessionInfo?> currentSession(String accessToken) async {
    if (!accessToken.startsWith('preview_' + subjectType + '_access_token_')) {
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
