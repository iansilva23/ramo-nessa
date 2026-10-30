import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'preparation_operation_journal.dart';
import '../../../core/auth/phone_auth_service.dart';

Future<PreparationOperationJournal> verifiedPreparationJournal({
  required Future<AuthSessionInfo?> Function() verifyAccount,
  required Uri coreUri,
  PreparationOperationStorage storage = const SecurePreparationOperationStorage(),
  DateTime Function()? clock,
}) async {
  final session = await verifyAccount().timeout(const Duration(seconds: 15));
  if (session == null || session.subjectType != 'passenger' ||
      session.subjectId.trim().isEmpty || !session.expiresAt.isAfter((clock ?? DateTime.now)())) {
    throw StateError('Sessão não confirmada.');
  }
  final journal = PreparationOperationJournal(
    storage: storage, passengerId: session.subjectId, coreUri: coreUri,
  );
  return journal;
}

class SecurePreparationOperationStorage implements PreparationOperationStorage {
  const SecurePreparationOperationStorage({this.storage = const FlutterSecureStorage()});
  final FlutterSecureStorage storage;

  @override
  Future<Map<String, String>> readAll() async {
    final values = await storage.readAll().timeout(const Duration(seconds: 10));
    return Map.fromEntries(values.entries.where((entry) =>
      entry.key.startsWith('ramo_preparation_v1_')));
  }

  @override
  Future<void> write(String key, String value) => storage.write(key: key, value: value).timeout(const Duration(seconds: 10));

  @override
  Future<void> delete(String key) => storage.delete(key: key).timeout(const Duration(seconds: 10));
}
