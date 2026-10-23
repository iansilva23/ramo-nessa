import 'dart:async';

import 'package:flutter/material.dart';

class RamoRideChatStatus {
  const RamoRideChatStatus({required this.unreadCount, this.passengerWhatsApp});
  factory RamoRideChatStatus.fromJson(Map<String, dynamic> json) =>
      RamoRideChatStatus(
        unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
        passengerWhatsApp: json['passengerWhatsApp'] as String?,
      );
  final int unreadCount;
  final String? passengerWhatsApp;
}

/// Optional capability keeps older preview/test services usable.
abstract interface class RamoRideChatApi {
  Future<RamoRideChatStatus> rideChatStatus(String rideId);
  Future<void> markRideMessagesRead(String rideId, List<String> messageIds);
  Future<List<Map<String, dynamic>>> rideChatPage(
    String rideId, {
    String? before,
  });
}

class RamoUnreadChatIcon extends StatefulWidget {
  const RamoUnreadChatIcon({
    super.key,
    required this.api,
    required this.rideId,
    this.icon = Icons.chat_bubble_outline_rounded,
    this.color,
    this.size,
  });
  final Object? api;
  final String rideId;
  final IconData icon;
  final Color? color;
  final double? size;
  @override
  State<RamoUnreadChatIcon> createState() => _RamoUnreadChatIconState();
}

class _RamoUnreadChatIconState extends State<RamoUnreadChatIcon>
    with WidgetsBindingObserver {
  Timer? _timer;
  int _count = 0;
  int _generation = 0;
  bool _busy = false;
  bool get _foreground =>
      WidgetsBinding.instance.lifecycleState == null ||
      WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_refresh());
    _timer = Timer.periodic(const Duration(seconds: 4), (_) => _refresh());
  }

  @override
  void didUpdateWidget(covariant RamoUnreadChatIcon oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.rideId != widget.rideId || oldWidget.api != widget.api) {
      _generation++;
      _count = 0;
      _busy = false;
      unawaited(_refresh());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_refresh());
  }

  Future<void> _refresh() async {
    final api = widget.api;
    if (_busy || !_foreground || api is! RamoRideChatApi) return;
    final generation = _generation;
    _busy = true;
    try {
      final status = await api.rideChatStatus(widget.rideId);
      if (mounted && generation == _generation) {
        setState(() => _count = status.unreadCount);
      }
    } catch (_) {
      // A temporary network failure must not falsely clear the badge.
    } finally {
      if (generation == _generation) _busy = false;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: _count > 0 ? '$_count mensagens não lidas' : 'Mensagens',
    child: Badge.count(
      count: _count,
      isLabelVisible: _count > 0,
      backgroundColor: Colors.red.shade700,
      textColor: Colors.white,
      child: Icon(widget.icon, color: widget.color, size: widget.size),
    ),
  );
}

/// Acknowledge only incoming bubbles visible in the foreground chat route.
/// Explicit message IDs avoid clearing arrivals concurrent with an HTTP fetch.
class RamoChatReadController with WidgetsBindingObserver {
  RamoChatReadController({
    required this.api,
    required this.rideId,
    required this.context,
    required this.scrollController,
  }) {
    WidgetsBinding.instance.addObserver(this);
    scrollController.addListener(checkVisible);
  }
  final Object api;
  final String rideId;
  final BuildContext Function() context;
  final ScrollController scrollController;
  final viewportKey = GlobalKey();
  final _keys = <String, GlobalKey>{};
  final _acknowledged = <String>{};
  final _pending = <String>{};
  bool _disposed = false;
  bool _scheduled = false;
  GlobalKey messageKey(String id) => _keys.putIfAbsent(id, () => GlobalKey());
  bool get _active =>
      !_disposed &&
      (WidgetsBinding.instance.lifecycleState == null ||
          WidgetsBinding.instance.lifecycleState ==
              AppLifecycleState.resumed) &&
      (ModalRoute.of(context())?.isCurrent ?? false);
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) checkVisible();
  }

  void checkVisible() {
    if (_disposed || _scheduled) return;
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduled = false;
      if (!_active) return;
      final service = api;
      final viewport = viewportKey.currentContext?.findRenderObject();
      if (service is! RamoRideChatApi ||
          viewport is! RenderBox ||
          !viewport.hasSize) {
        return;
      }
      final area = viewport.localToGlobal(Offset.zero) & viewport.size;
      final ids = <String>[];
      for (final entry in _keys.entries) {
        if (_acknowledged.contains(entry.key) || _pending.contains(entry.key)) {
          continue;
        }
        final box = entry.value.currentContext?.findRenderObject();
        if (box is! RenderBox || !box.attached || !box.hasSize) continue;
        final rect = box.localToGlobal(Offset.zero) & box.size;
        if (area.overlaps(rect)) ids.add(entry.key);
        if (ids.length == 100) break;
      }
      if (ids.isEmpty) return;
      _pending.addAll(ids);
      unawaited(
        service
            .markRideMessagesRead(rideId, ids)
            .then((_) {
              _acknowledged.addAll(ids);
            })
            .catchError((Object _) {
              // Polling and scrolling retry a failed acknowledgement.
            })
            .whenComplete(() => _pending.removeAll(ids)),
      );
    });
  }

  void dispose() {
    _disposed = true;
    scrollController.removeListener(checkVisible);
    WidgetsBinding.instance.removeObserver(this);
  }
}
