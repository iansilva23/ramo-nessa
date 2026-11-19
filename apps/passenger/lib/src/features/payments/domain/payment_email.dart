/// Checks only the format accepted by account registration, not mailbox access.
String? paymentEmailOrNull(String? value) {
  final email = value?.trim().toLowerCase() ?? '';
  if (email.length < 5 || email.length > 254 ||
      !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
    return null;
  }
  return email;
}
