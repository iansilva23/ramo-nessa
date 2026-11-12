import 'password_auth_service.dart';

class DriverLoginCredentials {
  const DriverLoginCredentials({
    required this.configured,
    this.username,
    this.email,
  });
  final bool configured;
  final String? username;
  final String? email;
}

abstract interface class DriverPasswordAuthService {
  Future<AuthSession> loginWithPassword({
    required String identifier,
    required String password,
  });
  Future<DriverLoginCredentials> loginCredentials(String accessToken);
  Future<void> createLoginCredentials({
    required String accessToken,
    required String username,
    required String email,
    required String password,
  });
}
