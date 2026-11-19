import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/payments/domain/pix_ride_payment_result.dart';
import 'package:ramo_nessa_passenger/src/features/payments/presentation/ride_payment_screen.dart';
import 'package:ramo_nessa_passenger/src/features/rides/data/passenger_ride_tracking_service.dart';
import 'package:ramo_nessa_passenger/src/features/rides/domain/passenger_ride_tracking_snapshot.dart';

class Tracking implements PassengerRideTrackingService {
  String state = 'AWAITING_PAYMENT';
  @override
  Future<PassengerRideTrackingSnapshot> tracking(String rideId) async =>
      PassengerRideTrackingSnapshot(rideId: rideId, state: state, category: 'car');
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  testWidgets('driver cancellation while Pix is open removes payment instructions', (tester) async {
    final tracking = Tracking();
    await tester.pumpWidget(MaterialApp(home: PixRidePaymentScreen(
      rideId: 'same-ride', holdExpiresAt: DateTime.now().add(const Duration(minutes: 10)),
      amountLabel: 'R\$ 30,00', driverReserved: true,
      result: const PixRidePaymentResult(internalPaymentId: 'original-payment',
        internalPaymentStatus: 'pending', orderId: 'order', gatewayPaymentId: 'gateway',
        status: 'pending', statusDetail: '', ticketUrl: '', qrCode: 'existing-pix-code', qrCodeBase64: ''),
      trackingService: tracking, realtimeService: null, routeService: null, networkTilesEnabled: false,
    )));
    await tester.pump();
    expect(find.text('Copiar código Pix'), findsOneWidget);
    tracking.state = 'CANCELLED_BY_DRIVER';
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Copiar código Pix'), findsNothing);
    expect(find.text('Pagar com Pix'), findsNothing);
    expect(find.text('Corrida cancelada pelo motorista'), findsWidgets);
    await tester.pumpWidget(const SizedBox());
  });
}
