import 'package:audioplayers/audioplayers.dart';

class OfferTonePlayer {
  final AudioPlayer _player = AudioPlayer();

  void prepare() {}

  Future<void> startLoop() async {
    await _player.setReleaseMode(ReleaseMode.loop);
    await _player.play(AssetSource('audio/nova_corrida.mp3'));
  }

  Future<void> stop() => _player.stop();
  Future<void> dispose() => _player.dispose();
}
