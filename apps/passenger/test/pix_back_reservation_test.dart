import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/passenger_payment_service.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/pix_ride_payment_result.dart';
import 'package:ramo_nessa_passenger/src/features/payments/presentation/ride_payment_screen.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/driver_confirmation_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/passenger_ride_tracking_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/domain/passenger_ride_tracking_snapshot.dart';

class Reservation implements DriverConfirmationService {
  int releases = 0;
  Completer<void>? pending;
  bool fail = false;
  @override
  Future<void> releaseDriverReservation(String rideId) async {
    expectSync(rideId, 'reserved-ride');
    releases++;
    if (pending != null) await pending!.future;
    if (fail) throw const PassengerPaymentException('A reserva não pode mais ser cancelada.');
  }
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class Tracking implements PassengerRideTrackingService {
  String state = 'AWAITING_PAYMENT';
  bool fail = false;
  int calls = 0;
  Completer<PassengerRideTrackingSnapshot>? pending;
  @override
  Future<PassengerRideTrackingSnapshot> tracking(String rideId) async {
    calls++;
    if (fail) throw const PassengerRideTrackingException('Sem conexão');
    if (pending != null) return pending!.future;
    return PassengerRideTrackingSnapshot(rideId: rideId, state: state, category: 'car');
  }
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<void> openPix(WidgetTester tester, Reservation reservation,
    {Tracking? tracking, VoidCallback? recoveryClose, bool expired = false}) async {
  await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) =>
      Scaffold(body: TextButton(onPressed: () {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) =>
          PixRidePaymentScreen(
            rideId: 'reserved-ride',
            holdExpiresAt: expired ? DateTime.now().subtract(const Duration(seconds: 1))
                : DateTime.now().add(const Duration(minutes: 10)),
            amountLabel: 'R\$ 30,00', driverReserved: true,
            confirmationService: reservation, onRecoveryClose: recoveryClose,
            result: const PixRidePaymentResult(internalPaymentId: 'payment',
              internalPaymentStatus: 'pending', orderId: 'order', gatewayPaymentId: 'gateway',
              status: 'pending', statusDetail: '', ticketUrl: '', qrCode: 'pix-code', qrCodeBase64: ''),
            trackingService: tracking, realtimeService: null, routeService: null,
            networkTilesEnabled: false,
          )));
      }, child: const Text('Escolher categoria'))))));
  await tester.tap(find.text('Escolher categoria'));
  await tester.pump();
  await tester.pump(const Duration(seconds: 1));
}

Future<void> confirmExit(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 350));
  expect(find.text('Deseja sair do pagamento?'), findsOneWidget);
  await tester.tap(find.text('Não paguei · desistir'));
  await tester.pump();
}

Future<void> finishBack(WidgetTester tester) async {
  // System Back is deferred, then the server check/release and route pop each
  // finish in later frames. Allow the pop animation to complete as well.
  for (var frame = 0; frame < 8; frame++) {
    await tester.pump(const Duration(milliseconds: 150));
  }
}

void main() {
  testWidgets('expired Back checks server and returns without a notice', (tester) async {
    final reservation = Reservation();
    final tracking = Tracking();
    await openPix(tester, reservation, tracking: tracking, expired: true);
    final previousCalls = tracking.calls;
    await tester.tap(find.byType(BackButton));
    await finishBack(tester);
    expect(tracking.calls, greaterThan(previousCalls));
    expect(find.text('Deseja sair do pagamento?'), findsNothing);
    expect(find.text('Escolher categoria'), findsOneWidget);
    expect(find.text('Pagar com Pix'), findsNothing);
    expect(reservation.releases, 1);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('expired system Back also returns without a notice', (tester) async {
    final reservation = Reservation();
    final tracking = Tracking();
    await openPix(tester, reservation, tracking: tracking, expired: true);
    await tester.binding.handlePopRoute();
    await finishBack(tester);
    expect(reservation.releases, 1, reason: 'server checks: ${tracking.calls}');
    expect(find.text('Deseja sair do pagamento?'), findsNothing);
    expect(find.text('Pagar com Pix'), findsNothing,
      reason: 'checks=${tracking.calls}; scopes=${tester.widgetList<PopScope>(
        find.byWidgetPredicate((widget) => widget is PopScope)).map((widget) => widget.canPop).toList()}; '
        'releaseError=${find.textContaining("Não foi possível liberar").evaluate().length}');
    expect(reservation.releases, 1);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('expired Back opens tracking when server says paid', (tester) async {
    final reservation = Reservation();
    final tracking = Tracking();
    await openPix(tester, reservation, tracking: tracking, expired: true);
    tracking.state = 'DRIVER_ASSIGNED';
    await tester.tap(find.byType(BackButton));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Deseja sair do pagamento?'), findsNothing);
    expect(find.text('Pagar com Pix'), findsNothing);
    expect(find.text('Escolher categoria').hitTestable(), findsNothing);
    expect(reservation.releases, 0);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('expired Back stays on failure and permits a fresh check', (tester) async {
    final reservation = Reservation();
    final tracking = Tracking();
    await openPix(tester, reservation, tracking: tracking, expired: true);
    tracking.fail = true;
    await tester.tap(find.byType(BackButton));
    await finishBack(tester);
    expect(find.text('Pagar com Pix'), findsOneWidget);
    expect(find.textContaining('Não foi possível conferir o pagamento'), findsOneWidget);
    expect(reservation.releases, 0);
    tracking.fail = false;
    await tester.tap(find.byType(BackButton));
    await finishBack(tester);
    expect(find.text('Pagar com Pix'), findsNothing);
    expect(reservation.releases, 1);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('expired Back waits for an existing poll without duplicate release', (tester) async {
    final reservation = Reservation();
    final tracking = Tracking();
    await openPix(tester, reservation, tracking: tracking, expired: true);
    final pending = Completer<PassengerRideTrackingSnapshot>();
    tracking.pending = pending;
    await tester.pump(const Duration(seconds: 3));
    final calls = tracking.calls;
    await tester.tap(find.byType(BackButton));
    await tester.pump();
    await tester.tap(find.byType(BackButton));
    expect(tracking.calls, calls);
    expect(reservation.releases, 0);
    tracking.pending = null;
    pending.complete(const PassengerRideTrackingSnapshot(
      rideId: 'reserved-ride', state: 'AWAITING_PAYMENT', category: 'car'));
    await finishBack(tester);
    expect(find.text('Pagar com Pix'), findsNothing);
    expect(reservation.releases, 1);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('expired Back preserves payment confirmed during release', (tester) async {
    final reservation = Reservation()..fail = true..pending = Completer<void>();
    final tracking = Tracking();
    await openPix(tester, reservation, tracking: tracking, expired: true);
    await tester.tap(find.byType(BackButton));
    await tester.pump();
    tracking.state = 'DRIVER_ASSIGNED';
    reservation.pending!.complete();
    await tester.pump();
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Pagar com Pix'), findsNothing);
    expect(find.text('Escolher categoria').hitTestable(), findsNothing);
    expect(reservation.releases, 1);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('continue payment closes the notice without releasing the driver', (tester) async {
    final reservation = Reservation();
    await openPix(tester, reservation);
    await tester.tap(find.byType(BackButton));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    expect(reservation.releases, 0);
    await tester.tap(find.text('Continuar no pagamento'));
    await finishBack(tester);
    expect(find.text('Deseja sair do pagamento?'), findsNothing);
    expect(find.text('Pagar com Pix'), findsOneWidget);
    expect(reservation.releases, 0);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('automatic confirmation closes an open notice and starts tracking', (tester) async {
    final reservation = Reservation();
    final tracking = Tracking();
    await openPix(tester, reservation, tracking: tracking);
    await tester.tap(find.byType(BackButton));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.text('Deseja sair do pagamento?'), findsOneWidget);
    tracking.state = 'DRIVER_ASSIGNED';
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Deseja sair do pagamento?'), findsNothing);
    expect(find.text('Pagar com Pix'), findsNothing);
    expect(find.text('Escolher categoria').hitTestable(), findsNothing);
    expect(reservation.releases, 0);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('already paid checks status without releasing the reservation', (tester) async {
    final reservation = Reservation();
    final tracking = Tracking();
    await openPix(tester, reservation, tracking: tracking);
    await tester.tap(find.byType(BackButton));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    await tester.tap(find.text('Já paguei · verificar'));
    await tester.pump();
    expect(find.text('Deseja sair do pagamento?'), findsOneWidget);
    expect(reservation.releases, 0);
    tracking.state = 'DRIVER_ASSIGNED';
    await tester.tap(find.text('Já paguei · verificar'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Deseja sair do pagamento?'), findsNothing);
    expect(find.text('Pagar com Pix'), findsNothing);
    expect(reservation.releases, 0);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('QR Back waits for release and ignores repeated taps', (tester) async {
    final reservation = Reservation()..pending = Completer<void>();
    await openPix(tester, reservation);
    await tester.tap(find.byType(BackButton));
    expect(reservation.releases, 0);
    await confirmExit(tester);
    await tester.tap(find.byType(BackButton));
    expect(reservation.releases, 1);
    expect(find.text('Pagar com Pix'), findsOneWidget);
    reservation.pending!.complete();
    await finishBack(tester);
    expect(find.text('Pagar com Pix'), findsNothing);
    expect(find.text('Escolher categoria'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('system Back also releases before returning', (tester) async {
    final reservation = Reservation();
    await openPix(tester, reservation);
    await tester.binding.handlePopRoute();
    expect(reservation.releases, 0);
    await confirmExit(tester);
    await finishBack(tester);
    expect(reservation.releases, 1);
    expect(find.text('Pagar com Pix'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('failed release stays on QR and permits retry', (tester) async {
    final reservation = Reservation()..fail = true;
    await openPix(tester, reservation);
    await tester.tap(find.byType(BackButton));
    await confirmExit(tester);
    await finishBack(tester);
    expect(find.text('Pagar com Pix'), findsOneWidget);
    expect(find.textContaining('Não foi possível liberar'), findsOneWidget);
    reservation.fail = false;
    await tester.tap(find.byType(BackButton));
    await confirmExit(tester);
    await finishBack(tester);
    expect(reservation.releases, 2);
    expect(find.text('Pagar com Pix'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('recovery close waits for release too', (tester) async {
    final reservation = Reservation()..pending = Completer<void>();
    var closed = false;
    await openPix(tester, reservation, recoveryClose: () => closed = true);
    await tester.tap(find.byType(BackButton));
    await confirmExit(tester);
    expect(closed, false);
    reservation.pending!.complete();
    await finishBack(tester);
    expect(closed, true);
    expect(reservation.releases, 1);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('payment confirmed during Back opens tracking instead of categories', (tester) async {
    final reservation = Reservation()..fail = true..pending = Completer<void>();
    final tracking = Tracking();
    await openPix(tester, reservation, tracking: tracking);
    await tester.tap(find.byType(BackButton));
    await confirmExit(tester);
    tracking.state = 'DRIVER_ASSIGNED';
    reservation.pending!.complete();
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Pagar com Pix'), findsNothing);
    expect(find.text('Escolher categoria').hitTestable(), findsNothing);
    expect(reservation.releases, 1);
    await tester.pumpWidget(const SizedBox());
  });
}
