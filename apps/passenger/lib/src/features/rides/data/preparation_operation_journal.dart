import 'dart:convert';
import 'dart:math';

/// Storage must persist successfully before an HTTP request may be sent.
abstract interface class PreparationOperationStorage {
  Future<Map<String, String>> readAll();
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// Contains request data only. Authentication headers never enter the journal.
class PreparationOperation {
  PreparationOperation._(this.key, this.bodyJson, this.createdAt, this._scope);

  final String key;
  final String bodyJson;
  final DateTime createdAt;
  final String _scope;

  Map<String, dynamic> get body =>
      jsonDecode(bodyJson) as Map<String, dynamic>;
}

class PreparationOperationJournal {
  PreparationOperationJournal({
    required this.storage,
    required String passengerId,
    required Uri coreUri,
    String Function()? newKey,
    DateTime Function()? clock,
  }) : _newKey = newKey ?? _randomKey,
       _clock = clock ?? DateTime.now {
    if (passengerId.trim().isEmpty || coreUri.host.isEmpty) {
      throw ArgumentError('A verified passenger and Core URL are required.');
    }
    // The account id is not an access token. Base64 separates storage namespaces
    // unambiguously without depending on platform-specific string hash codes.
    _prefix = 'ramo_preparation_v1_${base64Url.encode(utf8.encode(jsonEncode([
      coreUri.origin,
      passengerId,
    ])))}_';
  }

  final PreparationOperationStorage storage;
  final String Function() _newKey;
  final DateTime Function() _clock;
  late final String _prefix;

  static String _randomKey() {
    final random = Random.secure();
    return base64Url.encode(List.generate(32, (_) => random.nextInt(256)))
        .replaceAll('=', '');
  }

  static bool _validKey(String key) =>
      RegExp(r'^[A-Za-z0-9_-]{16,128}$').hasMatch(key);

  Future<PreparationOperation> create(Map<String, dynamic> body) async {
    final key = _newKey();
    if (!_validKey(key)) throw StateError('Invalid operation key.');
    // Encode immediately so mutation of the caller's map cannot change a retry.
    final operation = PreparationOperation._(
      key, jsonEncode(body), _clock().toUtc(), _prefix,
    );
    await storage.write('$_prefix$key', jsonEncode({
      'format': 1,
      'key': operation.key,
      'bodyJson': operation.bodyJson,
      'createdAt': operation.createdAt.toIso8601String(),
    }));
    return operation;
  }

  Future<List<PreparationOperation>> pending() async {
    final entries = await storage.readAll();
    final result = <PreparationOperation>[];
    for (final entry in entries.entries) {
      if (!entry.key.startsWith(_prefix)) continue;
      final decoded = jsonDecode(entry.value);
      if (decoded is! Map<String, dynamic> || decoded['format'] != 1 ||
          decoded['key'] is! String || !_validKey(decoded['key'] as String) ||
          entry.key != '$_prefix${decoded['key']}' ||
          decoded['bodyJson'] is! String || decoded['createdAt'] is! String ||
          jsonDecode(decoded['bodyJson'] as String) is! Map<String, dynamic>) {
        throw const FormatException('Invalid persisted preparation operation.');
      }
      result.add(PreparationOperation._(
        decoded['key'] as String, decoded['bodyJson'] as String,
        DateTime.parse(decoded['createdAt'] as String).toUtc(), _prefix,
      ));
    }
    result.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return result;
  }

  Future<void> acknowledge(PreparationOperation operation) {
    if (operation._scope != _prefix) {
      throw StateError('Operation belongs to a different passenger or Core.');
    }
    return storage.delete('$_prefix${operation.key}');
  }

  bool owns(PreparationOperation operation) => operation._scope == _prefix;

  /// A user opening a new search explicitly obtains a fresh intent.
  PreparationSearchIntent newIntent() => PreparationSearchIntent._(this);
}

/// One screen/search intent may have different categories or radii. Callers
/// supply a stable signature of the user's selection, excluding clock/GPS drift.
/// Repeating that selection reuses the exact saved JSON and operation key.
class PreparationSearchIntent {
  PreparationSearchIntent._(this._journal);
  final PreparationOperationJournal _journal;
  final Map<String, Future<PreparationOperation>> _operations = {};

  Future<PreparationOperation> operation({
    required String selection,
    required Map<String, dynamic> body,
  }) {
    if (selection.isEmpty) throw ArgumentError('Selection is required.');
    final existing = _operations[selection];
    if (existing != null) return existing;
    // Snapshot before scheduling any asynchronous storage work.
    final snapshot = jsonDecode(jsonEncode(body)) as Map<String, dynamic>;
    late final Future<PreparationOperation> future;
    future = _journal.create(snapshot).then((value) => value,
      onError: (Object error, StackTrace stack) {
        if (identical(_operations[selection], future)) {
          _operations.remove(selection);
        }
        Error.throwWithStackTrace(error, stack);
      },
    );
    _operations[selection] = future;
    return future;
  }
}
