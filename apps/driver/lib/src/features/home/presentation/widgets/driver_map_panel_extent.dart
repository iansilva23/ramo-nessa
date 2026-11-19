import 'package:flutter/material.dart';

/// Reports the actual card height after layout, including changes caused by
/// text scaling, ride stage and minimization. Never assumes a fixed device size.
class DriverMapPanelExtent extends StatefulWidget {
  const DriverMapPanelExtent({super.key, required this.child, required this.onHeight});
  final Widget child;
  final ValueChanged<double> onHeight;
  @override
  State<DriverMapPanelExtent> createState() => _DriverMapPanelExtentState();
}
class _DriverMapPanelExtentState extends State<DriverMapPanelExtent> {
  final _key = GlobalKey();
  double? _last;
  bool _scheduled = false;
  void _report() {
    if (_scheduled) return;
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduled = false;
      if (!mounted) return;
      final height = _key.currentContext?.size?.height;
      if (height != null && (_last == null || (height - _last!).abs() > .5)) {
        _last = height; widget.onHeight(height);
      }
    });
  }
  @override
  void initState() { super.initState(); _report(); }
  @override
  void didUpdateWidget(covariant DriverMapPanelExtent oldWidget) { super.didUpdateWidget(oldWidget); _report(); }
  @override
  Widget build(BuildContext context) => NotificationListener<SizeChangedLayoutNotification>(
    onNotification: (_) { _report(); return false; },
    child: SizedBox(key: _key, child: SizeChangedLayoutNotifier(child: widget.child)));
}
