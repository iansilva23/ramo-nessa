import 'dart:async';

/// Controls the lifecycle of the sound for exactly one active ride offer.
/// Audio commands are serialized so a delayed start cannot overtake a stop.
class OfferToneLifecycle {
  OfferToneLifecycle({
    required Future<void> Function() startLoop,
    required Future<void> Function() stopAudio,
    DateTime Function()? clock,
  })  : _startLoop = startLoop,
        _stopAudio = stopAudio,
        _clock = clock ?? DateTime.now;

  final Future<void> Function() _startLoop;
  final Future<void> Function() _stopAudio;
  final DateTime Function() _clock;

  Future<void> _pending = Future<void>.value();
  Timer? _expiryTimer;
  String? _offerId;
  DateTime? _deadline;
  int _version = 0;
  bool _disposed = false;

  String? get activeOfferId => _offerId;

  /// Only for verifying queued audio work in automated tests.
  Future<void> get idle => _pending;

  void synchronize(String? offerId, DateTime? expiresAt) {
    if (_disposed) return;
    if (offerId == null ||
        expiresAt == null ||
        !expiresAt.isAfter(_clock())) {
      stop();
      return;
    }

    if (_offerId == offerId) {
      if (_deadline != expiresAt) {
        _deadline = expiresAt;
        _scheduleExpiry(expiresAt);
      }
      return;
    }

    _version++;
    final version = _version;
    _offerId = offerId;
    _deadline = expiresAt;
    _scheduleExpiry(expiresAt);
    _enqueue(() async {
      await _stopAudio();
      if (!_canStart(version)) return;
      await _startLoop();
      if (!_canStart(version)) await _stopAudio();
    });
  }

  bool _canStart(int version) =>
      !_disposed &&
      version == _version &&
      _offerId != null &&
      (_deadline?.isAfter(_clock()) ?? false);

  void _scheduleExpiry(DateTime expiresAt) {
    _expiryTimer?.cancel();
    final remaining = expiresAt.difference(_clock());
    if (remaining <= Duration.zero) {
      stop();
      return;
    }
    _expiryTimer = Timer(remaining, stop);
  }

  /// Accept, reject, cancel, offline, or expiry: stop this offer's sound.
  void stop() {
    if (_disposed || (_offerId == null && _expiryTimer == null)) return;
    _version++;
    _offerId = null;
    _deadline = null;
    _expiryTimer?.cancel();
    _expiryTimer = null;
    _enqueue(_stopAudio);
  }

  void _enqueue(Future<void> Function() command) {
    _pending = _pending.then((_) async {
      try {
        await command();
      } catch (_) {
        // Audio errors must not interrupt the ride offer or its controls.
      }
    });
  }

  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    _version++;
    _offerId = null;
    _deadline = null;
    _expiryTimer?.cancel();
    _expiryTimer = null;
    _enqueue(_stopAudio);
    await _pending;
  }
}
