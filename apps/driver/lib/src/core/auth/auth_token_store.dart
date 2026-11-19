abstract interface class AuthTokenStore {
  Future<String?> readAccessToken();
  Future<void> saveAccessToken(String token);
  Future<void> clearAccessToken();
}
