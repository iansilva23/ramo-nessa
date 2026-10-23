import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

class _Chat implements RamoRideChatApi {
  int count = 3;
  bool fail = false;
  final reads = <String>[];
  @override
  Future<RamoRideChatStatus> rideChatStatus(String rideId) async {
    if (fail) throw Exception('offline');
    return RamoRideChatStatus(unreadCount: count);
  }

  @override
  Future<void> markRideMessagesRead(
    String rideId,
    List<String> messageIds,
  ) async {
    reads.addAll(messageIds);
  }

  @override
  Future<List<Map<String, dynamic>>> rideChatPage(
    String rideId, {
    String? before,
  }) async => [];
}

void main() {
  testWidgets(
    'badge counts unread, survives network error, clears only on successful zero',
    (tester) async {
      final api = _Chat();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: RamoUnreadChatIcon(api: api, rideId: 'ride'),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('3'), findsOneWidget);
      api.fail = true;
      await tester.pump(const Duration(seconds: 4));
      await tester.pump();
      expect(find.text('3'), findsOneWidget);
      api.fail = false;
      api.count = 0;
      await tester.pump(const Duration(seconds: 4));
      await tester.pump();
      expect(find.text('3'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'only foreground visible incoming bubbles receive read acknowledgements',
    (tester) async {
      final api = _Chat();
      final scroll = ScrollController();
      late RamoChatReadController reads;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              reads = RamoChatReadController(
                api: api,
                rideId: 'ride',
                context: () => context,
                scrollController: scroll,
              );
              return Scaffold(
                body: SizedBox(
                  height: 200,
                  child: ListView(
                    key: reads.viewportKey,
                    controller: scroll,
                    children: [
                      SizedBox(
                        key: reads.messageKey('visible'),
                        height: 80,
                        child: const Text('Cheguei'),
                      ),
                      const SizedBox(height: 800),
                      SizedBox(
                        key: reads.messageKey('offscreen'),
                        height: 80,
                        child: const Text('Depois'),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      );
      reads.checkVisible();
      await tester.pump();
      await tester.pump();
      expect(api.reads, ['visible']);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      scroll.jumpTo(scroll.position.maxScrollExtent);
      await tester.pump();
      expect(api.reads, ['visible']);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      await tester.pump();
      expect(api.reads, ['visible', 'offscreen']);
      reads.checkVisible();
      await tester.pump();
      expect(api.reads.length, 2);
      reads.dispose();
      await tester.pumpWidget(const SizedBox());
      scroll.dispose();
    },
  );
}
