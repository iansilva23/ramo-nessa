import 'package:flutter/widgets.dart';

/// Evita anunciar disponibilidade sem GPS ao retornar do segundo plano na Web.
/// Apps nativos mantêm seus próprios serviços de localização em background.
abstract final class DriverWebAvailabilityPolicy {
  static bool isBackgroundTransition(AppLifecycleState state) =>
      state == AppLifecycleState.hidden ||
      state == AppLifecycleState.paused ||
      state == AppLifecycleState.detached;

  static bool shouldSetOffline({
    required bool isWeb,
    required bool online,
    required bool busy,
    required bool hasActiveRide,
  }) =>
      isWeb && online && !busy && !hasActiveRide;
}
