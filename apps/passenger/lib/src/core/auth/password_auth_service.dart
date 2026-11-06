import 'dart:typed_data';

class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.expiresAt,
    required this.subjectId,
    required this.subjectType,
  });

  final String accessToken;
  final DateTime expiresAt;
  final String subjectId;
  final String subjectType;
}

class AuthSessionInfo {
  const AuthSessionInfo({
    required this.expiresAt,
    required this.subjectId,
    required this.subjectType,
    this.email,
    this.fullName,
  });

  final DateTime expiresAt;
  final String subjectId;
  final String subjectType;
  final String? email;
  final String? fullName;
}

class AuthSecuritySession {
  const AuthSecuritySession({
    required this.id,
    required this.subjectType,
    required this.createdAt,
    required this.expiresAt,
  });

  final String id;
  final String subjectType;
  final DateTime createdAt;
  final DateTime expiresAt;
}

class RevokeOtherSessionsResult {
  const RevokeOtherSessionsResult({
    required this.revokedSessions,
    required this.disabledDevices,
  });

  final int revokedSessions;
  final int disabledDevices;
}

class PassengerAccount {
  const PassengerAccount({
    required this.subjectId,
    required this.phoneE164,
    this.email,
    this.fullName,
    this.photoUrl,
  });

  final String subjectId;
  final String phoneE164;
  final String? email;
  final String? fullName;
  final String? photoUrl;
}

abstract interface class PasswordAuthService {
  Future<AuthSession> registerWithPassword({
    required String fullName,
    required String phone,
    required String email,
    required String password,
    String? username,
  });

  Future<AuthSession> loginWithPassword({
    required String email,
    required String password,
  });

  Future<PassengerAccount> passengerAccount(String accessToken);

  Future<PassengerAccount> updatePassengerAccount({
    required String accessToken,
    String? fullName,
    String? email,
    String? password,
  });

  Future<PassengerAccount> updatePassengerPhoto({
    required String accessToken,
    required Uint8List bytes,
    required String mimeType,
  });

  Future<AuthSessionInfo?> currentSession(String accessToken);

  Future<AuthSecuritySession> securitySession(String accessToken);

  Future<RevokeOtherSessionsResult> revokeOtherSessions(String accessToken);

  Future<void> logout(String accessToken);
}
