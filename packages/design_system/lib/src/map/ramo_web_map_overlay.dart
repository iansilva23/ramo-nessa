import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:pointer_interceptor/pointer_interceptor.dart';

/// Shields only a painted Flutter control/panel above an HTML map.
/// Never wrap the map, a full-screen Stack, Spacer or expanding Align.
/// Native Android/iOS return the original child without a platform view.
class RamoWebMapOverlay extends StatelessWidget {
  const RamoWebMapOverlay({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb) return child;
    return PointerInterceptor(child: child);
  }
}
