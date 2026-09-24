import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform;

class DefaultFirebaseOptions {
  const DefaultFirebaseOptions._();

  static FirebaseOptions get currentPlatform {
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError(
          'Firebase não está configurado para esta plataforma.',
        );
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyBab8q3VydNE-BSRMX_1ewhIeBfnF0B2Mk',
    appId: '1:938646689425:android:667ef907e447dfcb2f9130',
    messagingSenderId: '938646689425',
    projectId: 'ramo-nessa',
    storageBucket: 'ramo-nessa.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyA257wFMoXqcFjtTWyXYZfxT3XLjURQT_k',
    appId: '1:938646689425:ios:4b71ab995ab2c3f12f9130',
    messagingSenderId: '938646689425',
    projectId: 'ramo-nessa',
    storageBucket: 'ramo-nessa.firebasestorage.app',
    iosBundleId: 'br.com.ramonessa.passenger',
  );
}
