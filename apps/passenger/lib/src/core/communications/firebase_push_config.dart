import 'package:firebase_core/firebase_core.dart';

abstract final class RamoFirebasePushConfig {
  static const apiKey = String.fromEnvironment(
    'RAMO_FIREBASE_API_KEY',
    defaultValue: '',
  );
  static const appId = String.fromEnvironment(
    'RAMO_FIREBASE_APP_ID',
    defaultValue: '',
  );
  static const messagingSenderId = String.fromEnvironment(
    'RAMO_FIREBASE_MESSAGING_SENDER_ID',
    defaultValue: '',
  );
  static const projectId = String.fromEnvironment(
    'RAMO_FIREBASE_PROJECT_ID',
    defaultValue: '',
  );
  static const storageBucket = String.fromEnvironment(
    'RAMO_FIREBASE_STORAGE_BUCKET',
    defaultValue: '',
  );

  static bool get enabled =>
      apiKey.trim().isNotEmpty &&
      appId.trim().isNotEmpty &&
      messagingSenderId.trim().isNotEmpty &&
      projectId.trim().isNotEmpty;

  static FirebaseOptions? get options {
    if (!enabled) return null;
    return FirebaseOptions(
      apiKey: apiKey.trim(),
      appId: appId.trim(),
      messagingSenderId: messagingSenderId.trim(),
      projectId: projectId.trim(),
      storageBucket:
          storageBucket.trim().isEmpty ? null : storageBucket.trim(),
    );
  }
}
