import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/http_passenger_payment_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/http_passenger_activity_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/http_passenger_ride_tracking_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/passenger_activity_screen.dart';
import 'package:ramo_nessa_passenger/src/features/rides/presentation/resumed_ride_screen.dart';
import 'package:ramo_nessa_passenger/src/features/payments/presentation/ride_payment_screen.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/pix_ride_payment_result.dart';

void main() {
  for (final restored in [false, true]) {
    for (final consent in [false, true]) {
      testWidgets('explicit abandonment sends DELETE and refreshes history restored=$restored consent=$consent', (tester) async {
        tester.view.physicalSize = const Size(430, 950);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const token = 'isolated-session';
        var state = 'AWAITING_PAYMENT';
        final requests = <http.Request>[];
        final cancellation = Completer<void>();
        Map<String, dynamic> ride() => {
          'id': id, 'state': state, 'category': 'buggy',
          'driverConsentRequired': consent,
          'paymentExpiresAt': DateTime.now().add(const Duration(minutes: 10)).toIso8601String(),
          'driverHoldExpiresAt': DateTime.now().add(const Duration(minutes: 10)).toIso8601String(),
          'origin': {'zoneId': 'jeri'}, 'destination': {'zoneId': 'jeri'},
          'quote': {'totalAmountCents': 3000}, 'totalAmountCents': 3000,
          'createdAt': '2026-11-19T12:00:00Z', 'updatedAt': '2026-11-19T12:00:00Z',
        };
        final pix = {
          'payment': {'id': 'existing-payment', 'status': 'pending'},
          'pix': {'orderId': 'existing-order', 'paymentId': 'existing-provider-payment',
            'qrCode': 'existing-copy-code', 'qrCodeBase64': ''},
        };
        final client = MockClient((request) async {
          requests.add(request);
          expect(request.headers['authorization'], 'Bearer $token');
          if (request.method == 'DELETE') {
            expect(request.url.path, '/v1/rides/$id/driver-confirmation');
            await cancellation.future;
            state = 'CANCELLED_BY_PASSENGER';
            return http.Response(jsonEncode({'ride': ride()}), 200);
          }
          expect(request.method, 'GET', reason: 'Reopening must not create a payment');
          if (request.url.path == '/v1/passenger/me/activity') {
            return http.Response(jsonEncode({'summary': {'total': 1}, 'rides': [ride()]}), 200);
          }
          if (request.url.path == '/v1/passenger/me/ride') {
            expect(request.url.queryParameters['rideId'], id);
            return http.Response(jsonEncode({'ride': ride(),
              'payment': {'id': 'existing-payment', 'status': 'pending', 'amountCents': 3000},
              'pix': pix}), 200);
          }
          return http.Response(jsonEncode({'ride': ride()}), 200);
        });
        final base = Uri.parse('https://test.invalid');
        final tracking = HttpPassengerRideTrackingService(baseUrl: base, accessToken: token, client: client);
        final payments = HttpPassengerPaymentService(baseUrl: base, accessToken: token, client: client);
        final activity = HttpPassengerActivityService(baseUrl: base, accessToken: token, client: client);
        await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) => Scaffold(
          body: PassengerActivityScreen(service: activity, onResume: (selected) async {
            final data = await tracking.resumeSelectedRide(selected.id);
            if (!context.mounted) return;
            await Navigator.of(context).push(MaterialPageRoute<void>(builder: (routeContext) {
              void close() => Navigator.of(routeContext).pop();
              return restored ? ResumedRideScreen(data: data, onClose: close,
                tracking: tracking, payments: payments, networkTilesEnabled: false)
                : PixRidePaymentScreen(rideId: id,
                  holdExpiresAt: DateTime.now().add(const Duration(minutes: 10)),
                  amountLabel: 'R\$ 30,00', driverReserved: consent,
                  confirmationService: payments, onRecoveryClose: close,
                  result: PixRidePaymentResult.fromJson(pix), trackingService: tracking,
                  realtimeService: null, routeService: null, networkTilesEnabled: false);
            }));
          }),
        ))));
        await tester.pumpAndSettle();
        expect(find.text('Aguardando pagamento'), findsWidgets);
        await tester.tap(find.text('Ver pagamento'));
        // Pix has a continuous waiting indicator: settle route frames, not all animations.
        for (var frame = 0; frame < 90; frame++) {
          await tester.pump(const Duration(milliseconds: 16));
        }
        expect(requests.where((r) => r.method == 'DELETE'), isEmpty);
        expect(find.text('Copiar código Pix'), findsOneWidget);
        await tester.tap(find.byType(BackButton));
        for (var frame = 0; frame < 30; frame++) {
          await tester.pump(const Duration(milliseconds: 16));
        }
        await tester.ensureVisible(find.text('Não paguei · desistir'));
        await tester.tap(find.text('Não paguei · desistir'));
        await tester.pump();
        expect(requests.where((r) => r.method == 'DELETE'), hasLength(1));
        expect(state, 'AWAITING_PAYMENT');
        expect(find.text('Copiar código Pix'), findsOneWidget);
        cancellation.complete();
        for (var frame = 0; frame < 90; frame++) {
          await tester.pump(const Duration(milliseconds: 16));
        }
        await tester.pumpAndSettle(const Duration(milliseconds: 16),
          EnginePhase.sendSemanticsUpdate, const Duration(seconds: 5));
        expect(find.text('Copiar código Pix'), findsNothing);
        expect(find.text('Ver pagamento'), findsNothing);
        await tester.tap(find.text('Histórico'));
        await tester.pumpAndSettle();
        expect(find.text('Cancelada pelo passageiro'), findsWidgets);
        expect(requests.where((r) => r.method == 'DELETE'), hasLength(1));
        expect(requests.where((r) => r.method == 'POST'), isEmpty);
        await tester.pumpWidget(const SizedBox());
        client.close();
      });
    }
  }
}
