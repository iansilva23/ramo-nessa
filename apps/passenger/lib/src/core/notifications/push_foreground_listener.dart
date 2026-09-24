import 'dart:async';

import 'package:flutter/material.dart';

import 'firebase_push_coordinator.dart';

class PushForegroundListener extends StatefulWidget {
  const PushForegroundListener({
    super.key,
    required this.coordinator,
    required this.child,
  });

  final FirebasePushCoordinator? coordinator;
  final Widget child;

  @override
  State<PushForegroundListener> createState() =>
      _PushForegroundListenerState();
}

class _PushForegroundListenerState
    extends State<PushForegroundListener> {
  StreamSubscription<PushForegroundNotice>? _subscription;

  @override
  void initState() {
    super.initState();
    _subscribe();
  }

  @override
  void didUpdateWidget(covariant PushForegroundListener oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.coordinator != widget.coordinator) {
      unawaited(_subscription?.cancel());
      _subscription = null;
      _subscribe();
    }
  }

  void _subscribe() {
    final coordinator = widget.coordinator;
    if (coordinator == null) return;
    _subscription = coordinator.foregroundNotices.listen(_showNotice);
  }

  void _showNotice(PushForegroundNotice notice) {
    if (!mounted) return;
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) return;

    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          duration: const Duration(seconds: 5),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                notice.title,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              if (notice.body.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(notice.body),
              ],
            ],
          ),
        ),
      );
  }

  @override
  void dispose() {
    unawaited(_subscription?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
