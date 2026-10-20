/// Map transitions for an ongoing ride. This policy is pure Dart, so it can
/// be verified without Google Maps tiles, device GPS or paid route requests.
abstract final class TrackingMapTransitionPolicy {
  static String stageFor({
    required String rideState,
    required bool terminal,
  }) {
    if (terminal) return 'terminal';
    return rideState == 'IN_PROGRESS' ? 'to-dropoff' : 'to-pickup';
  }

  /// Polling and realtime driver positions update the marker, not the camera.
  /// The first valid location can establish the initial map position.
  static bool shouldCenterInitially({
    required bool mapReady,
    required bool alreadyCentered,
    required bool hasPosition,
  }) => mapReady && !alreadyCentered && hasPosition;

  /// Fit exactly once for pickup and once for the destination stage.
  /// Position refreshes while in the same stage keep the existing viewport.
  static bool shouldFrameRoute({
    required bool mapReady,
    required bool terminal,
    required bool hasDriver,
    required bool hasTarget,
    required int routePointCount,
    required String stage,
    required String? lastFramedStage,
  }) => mapReady && !terminal && hasDriver && hasTarget &&
      routePointCount >= 2 && stage != lastFramedStage;

  /// A route response from the previous stage must never redraw the map.
  static bool isCurrentRouteResponse({
    required int requestEpoch,
    required int latestEpoch,
    required String requestedStage,
    required String latestStage,
  }) => requestEpoch == latestEpoch && requestedStage == latestStage;
}
