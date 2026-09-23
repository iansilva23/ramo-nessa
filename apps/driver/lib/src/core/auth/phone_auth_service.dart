class RequestedOtp {
  const RequestedOtp({
    required this.challengeId,
    required this.expiresAt,
    required this.retryAfterSeconds,
    this.devCode,
  });

  final String challengeId;
  final DateTime expiresAt;
  final int retryAfterSeconds;
  final String? devCode;
}

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

abstract interface class PhoneAuthService {
  Future<RequestedOtp> requestOtp(String phone);
  Future<AuthSession> verifyOtp({
    required String challengeId,
    required String code,
  });
  Future<AuthSessionInfo?> currentSession(String accessToken);
  Future<void> logout(String accessToken);
}
