import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class OfferTonePlayer {
  final AudioPlayer _player = AudioPlayer();

  static const _alerts = MethodChannel('br.com.ramonessa.driver/ride-alerts');

  void prepare() {}

  Future<void> startLoop() async {
    try {
      if (defaultTargetPlatform == TargetPlatform.android) {
        await _alerts.invokeMethod<void>('vibrateOffer');
        if (await _alerts.invokeMethod<bool>('canPlayOffer') == false) return;
      } else if (defaultTargetPlatform == TargetPlatform.iOS) {
        await HapticFeedback.heavyImpact();
      }
    } on MissingPluginException {
      // The notification remains audible when haptics are unavailable.
    } on PlatformException {
      // The notification remains audible when haptics are unavailable.
    }
    await _player.setAudioContext(AudioContext(
      android: const AudioContextAndroid(
        usageType: AndroidUsageType.notificationRingtone,
        audioFocus: AndroidAudioFocus.gainTransientMayDuck,
      ),
      iOS: AudioContextIOS(
        category: AVAudioSessionCategory.ambient,
      ),
    ));
    await _player.setReleaseMode(ReleaseMode.loop);
    await _player.play(AssetSource('audio/nova_corrida.mp3'));
  }

  Future<void> stop() async {
    await _player.stop();
    if (defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await _alerts.invokeMethod<void>('stopOfferVibration');
    } on MissingPluginException {
      // Haptics are optional.
    } on PlatformException {
      // Haptics are optional.
    }
  }
  Future<void> dispose() => _player.dispose();
}
