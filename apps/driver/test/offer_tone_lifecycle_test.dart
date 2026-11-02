import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/offer_tone_lifecycle.dart';

void main() {
  test('nova oferta inicia loop uma vez e aceite encerra', () async {
    var starts = 0;
    var stops = 0;
    final tone = OfferToneLifecycle(
      startLoop: () async { starts++; },
      stopAudio: () async { stops++; },
    );
    final expiresAt = DateTime.now().add(const Duration(minutes: 1));

    tone.synchronize('offer-1', expiresAt);
    await tone.idle;
    expect(starts, 1);
    expect(tone.activeOfferId, 'offer-1');

    tone.synchronize('offer-1', expiresAt); // Polling must not restart audio.
    await tone.idle;
    expect(starts, 1);

    tone.stop(); // Accept or reject.
    await tone.idle;
    expect(tone.activeOfferId, isNull);
    expect(stops, greaterThanOrEqualTo(2));
    await tone.dispose();
  });

  test('expiracao do prazo encerra o som sem acao do motorista', () async {
    var stops = 0;
    final tone = OfferToneLifecycle(
      startLoop: () async {},
      stopAudio: () async { stops++; },
    );
    tone.synchronize(
      'offer-expiring',
      DateTime.now().add(const Duration(milliseconds: 60)),
    );
    await tone.idle;
    expect(tone.activeOfferId, 'offer-expiring');

    await Future<void>.delayed(const Duration(milliseconds: 140));
    await tone.idle;
    expect(tone.activeOfferId, isNull);
    expect(stops, greaterThanOrEqualTo(2));
    await tone.dispose();
  });

  test('cancelamento remoto e nova oferta nao sobrepoem toques', () async {
    var starts = 0;
    var stops = 0;
    final tone = OfferToneLifecycle(
      startLoop: () async { starts++; },
      stopAudio: () async { stops++; },
    );
    final deadline = DateTime.now().add(const Duration(minutes: 1));

    tone.synchronize('first', deadline);
    await tone.idle;
    tone.synchronize(null, null); // Offer removed by realtime/poll.
    await tone.idle;
    expect(tone.activeOfferId, isNull);

    tone.synchronize('second', deadline);
    await tone.idle;
    expect(tone.activeOfferId, 'second');
    expect(starts, 2);
    expect(stops, greaterThanOrEqualTo(3));

    tone.stop(); // Offline.
    await tone.dispose();
  });

  test('revalidacao com mesmo id e novo prazo nao reinicia a melodia', () async {
    var starts = 0;
    final tone = OfferToneLifecycle(
      startLoop: () async { starts++; },
      stopAudio: () async {},
    );
    final now = DateTime.now();
    tone.synchronize('offer', now.add(const Duration(milliseconds: 80)));
    await tone.idle;
    tone.synchronize('offer', now.add(const Duration(minutes: 1)));

    await Future<void>.delayed(const Duration(milliseconds: 130));
    await tone.idle;
    expect(tone.activeOfferId, 'offer');
    expect(starts, 1);
    await tone.dispose();
  });

  test('aceite durante inicializacao lenta nao deixa audio tocando', () async {
    final started = Completer<void>();
    var stops = 0;
    final tone = OfferToneLifecycle(
      startLoop: () async { await started.future; },
      stopAudio: () async { stops++; },
    );
    tone.synchronize(
      'pending',
      DateTime.now().add(const Duration(minutes: 1)),
    );
    await Future<void>.delayed(Duration.zero);
    tone.stop(); // Acceptance while the plugin is still starting.
    started.complete();
    await tone.idle;
    expect(tone.activeOfferId, isNull);
    expect(stops, greaterThanOrEqualTo(2));
    await tone.dispose();
  });

  test('erro do plugin de audio nao interfere no estado da corrida', () async {
    final tone = OfferToneLifecycle(
      startLoop: () async => throw StateError('device muted'),
      stopAudio: () async => throw StateError('plugin unavailable'),
    );
    tone.synchronize(
      'offer',
      DateTime.now().add(const Duration(minutes: 1)),
    );
    await tone.idle;
    expect(tone.activeOfferId, 'offer');
    tone.stop();
    await tone.idle;
    expect(tone.activeOfferId, isNull);
    await tone.dispose();
  });
}
