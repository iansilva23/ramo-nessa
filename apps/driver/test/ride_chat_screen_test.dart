import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_api.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_models.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/driver_ride_chat_screen.dart';

class _Api implements DriverApi, RamoRideChatApi {
  String? phone = '+5588999990001';
  final reads = <String>[];
  @override
  Future<List<DriverRideChatMessage>> rideMessages(String rideId) async => [
    DriverRideChatMessage(
      id: 'incoming',
      rideId: rideId,
      senderType: 'passenger',
      senderId: 'passenger',
      body: 'Estou no portão',
      createdAt: DateTime(2026),
    ),
    DriverRideChatMessage(
      id: 'own',
      rideId: rideId,
      senderType: 'driver',
      senderId: 'driver',
      body: 'Estou chegando',
      createdAt: DateTime(2026, 1, 2),
    ),
  ];
  @override
  Future<RamoRideChatStatus> rideChatStatus(String rideId) async =>
      RamoRideChatStatus(unreadCount: 1, passengerWhatsApp: phone);
  @override
  Future<void> markRideMessagesRead(String rideId, List<String> ids) async =>
      reads.addAll(ids);
  @override
  Future<List<Map<String, dynamic>>> rideChatPage(
    String rideId, {
    String? before,
  }) async => [];
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  testWidgets(
    'narrow chat renders WhatsApp, opens correct contact, and reads incoming only',
    (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      String? opened;
      const channel = MethodChannel('plugins.flutter.io/url_launcher');
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
        call,
      ) async {
        opened = (call.arguments as Map)['url'] as String?;
        return true;
      });
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          channel,
          null,
        ),
      );
      final api = _Api();
      await tester.pumpWidget(
        MaterialApp(
          home: DriverRideChatScreen(api: api, rideId: 'ride'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('WhatsApp do passageiro'), findsOneWidget);
      expect(find.text('+5588999990001'), findsOneWidget);
      expect(api.reads, ['incoming']);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Chamar no WhatsApp'));
      await tester.pumpAndSettle();
      expect(opened, 'https://wa.me/5588999990001');
      api.phone = null;
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(find.text('Chamar no WhatsApp'), findsNothing);
      expect(api.reads, ['incoming']);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
