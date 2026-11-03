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
  });

  final DateTime expiresAt;
  final String subjectId;
  final String subjectType;
}

abstract interface class PasswordAuthService {
  Future<AuthSession> registerWithPassword({
    required String fullName,
    required String phone,
    required String email,
    required String password,
    String? username,
  });

  Future<AuthSessionInfo?> currentSession(String accessToken);
  Future<void> logout(String accessToken);
}
