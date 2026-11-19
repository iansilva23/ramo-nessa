// ignore_for_file: prefer_interpolation_to_compose_strings

import 'dart:typed_data';

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

  PassengerAccount _account = const PassengerAccount(
    subjectId: 'preview-passenger',
    phoneE164: '+5588999999999',
    email: 'preview@ramonessa.app',
    fullName: 'Passageiro Preview',
  );

  AuthSession _session() => AuthSession(
    accessToken:
        'preview_' + subjectType + '_access_token_12345678901234567890',
    expiresAt: DateTime.now().add(const Duration(days: 7)),
    subjectId: 'preview-' + subjectType,
    subjectType: subjectType,
  );

  @override
  Future<AuthSession> loginWithPassword({
    required String email,
    required String password,
  }) async {
    if (email.trim().isEmpty || password.trim().isEmpty) {
      throw Exception('Informe e-mail e senha.');
    }
    return _session();
  }

  @override
  Future<PassengerAccount> passengerAccount(String accessToken) async =>
      _account;

  @override
  Future<PassengerAccount> updatePassengerAccount({
    required String accessToken,
    String? fullName,
    String? email,
    String? password,
  }) async {
    _account = PassengerAccount(
      subjectId: _account.subjectId,
      phoneE164: _account.phoneE164,
      email: email ?? _account.email,
      fullName: fullName ?? _account.fullName,
      photoUrl: _account.photoUrl,
    );
    return _account;
  }

  @override
  Future<PassengerAccount> updatePassengerPhoto({
    required String accessToken,
    required Uint8List bytes,
    required String mimeType,
  }) async {
    _account = PassengerAccount(
      subjectId: _account.subjectId,
      phoneE164: _account.phoneE164,
      email: _account.email,
      fullName: _account.fullName,
      photoUrl: 'preview://passenger-photo',
    );
    return _account;
  }

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
      email: _account.email,
      fullName: _account.fullName,
    );
  }

  @override
  Future<AuthSecuritySession> securitySession(String accessToken) async =>
      AuthSecuritySession(
        id: 'preview-security-session',
        subjectType: subjectType,
        createdAt: DateTime.now(),
        expiresAt: DateTime.now().add(const Duration(days: 7)),
      );

  @override
  Future<RevokeOtherSessionsResult> revokeOtherSessions(
    String accessToken,
  ) async =>
      const RevokeOtherSessionsResult(revokedSessions: 0, disabledDevices: 0);

  @override
  Future<void> logout(String accessToken) async {}
}
