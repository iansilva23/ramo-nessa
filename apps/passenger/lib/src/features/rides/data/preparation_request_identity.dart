import 'dart:convert';
import 'dart:math';

/// Identifies one reservation submission. Contains no payment or recovery logic.
class PreparationRequestIdentity {
  const PreparationRequestIdentity(this.key, this.bodyJson);
  final String key;
  final String bodyJson;
}

/// Lives only for the current search. Repeating the same submission preserves
/// its key and exact JSON; a different selection or explicit new search does not.
class PreparationSearchIntent {
  PreparationSearchIntent({String Function()? newKey}) : _newKey = newKey ?? _randomKey;
  final String Function() _newKey;
  String? _selection;
  PreparationRequestIdentity? _request;

  static String _randomKey() {
    final random = Random.secure();
    return base64Url.encode(List.generate(32, (_) => random.nextInt(256))).replaceAll('=', '');
  }

  PreparationRequestIdentity operation({required String selection, required Map<String, dynamic> body}) {
    if (selection.isEmpty) throw ArgumentError('Selection is required.');
    final previous = _request;
    if (_selection == selection && previous != null) return previous;
    final key = _newKey();
    if (!RegExp(r'^[A-Za-z0-9_-]{16,128}$').hasMatch(key)) {
      throw StateError('Invalid preparation key.');
    }
    final request = PreparationRequestIdentity(key, jsonEncode(body));
    _selection = selection;
    return _request = request;
  }

  void reset() { _selection = null; _request = null; }
}
