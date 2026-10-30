import 'http_ride_preparation_service.dart';
import 'passenger_ride_resume_service.dart';

class PreparationRecoveryResult {
  const PreparationRecoveryResult({this.ride, this.pendingRetry = false});
  final Map<String, dynamic>? ride;
  final bool pendingRetry;
}

/// Resolves uncertain submissions with their original key, then reads current
/// server state. Never requests a payment, dispatch, refund or cancellation.
class PreparationRecoveryCoordinator {
  PreparationRecoveryCoordinator({
    required this.preparation,
    required this.selected,
    required this.current,
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now;

  final HttpRidePreparationService preparation;
  final PassengerSelectedRideResumeService selected;
  final PassengerRideResumeService current;
  final DateTime Function() _clock;
  Future<PreparationRecoveryResult>? _inFlight;

  Future<PreparationRecoveryResult> recover() {
    final previous = _inFlight;
    if (previous != null) return previous;
    late final Future<PreparationRecoveryResult> running;
    running = _recover().whenComplete(() {
      if (identical(_inFlight, running)) _inFlight = null;
    });
    return _inFlight = running;
  }

  bool _open(Map<String, dynamic> data) {
    final ride = data['ride'];
    if (ride == null) return false;
    if (ride is! Map<String, dynamic> || ride['id'] is! String || ride['state'] is! String) {
      throw const FormatException('Invalid ride recovery.');
    }
    final state = ride['state'] as String;
    if (state.startsWith('CANCELLED_') ||
        const {'COMPLETED', 'EXPIRED', 'REFUNDED', 'REFUND_PENDING'}.contains(state)) {
      return false;
    }
    if (const {'CREATED', 'AWAITING_PAYMENT', 'PAYMENT_FAILED'}.contains(state)) {
      final deadline = ride['paymentExpiresAt'] ?? ride['driverHoldExpiresAt'];
      if (deadline is! String) throw const FormatException('Missing checkout deadline.');
      if (!DateTime.parse(deadline).isAfter(_clock())) return false;
    }
    return true;
  }

  Future<PreparationRecoveryResult> _recover() async {
    final journal = preparation.operationJournal;
    if (journal == null) throw StateError('Persistent recovery is not configured.');
    Map<String, dynamic>? recovered;
    var pendingRetry = false;
    try {
      final pending = (await journal.pending()).reversed;
      for (final operation in pending) {
        if (operation.abandoned) continue;
        try {
          String rideId;
          try {
            rideId = (await preparation.replayOperation(operation)).id;
          } on PreparationReplayException catch (error) {
            if (error.code == 'NO_ELIGIBLE_DRIVER') {
              await journal.acknowledge(operation);
              continue;
            }
            if (!const {'PREPARATION_EXPIRED', 'PREPARATION_ALREADY_ADVANCED'}.contains(error.code) ||
                error.rideId == null) {
              rethrow;
            }
            rideId = error.rideId!;
          }
          final data = await selected.resumeSelectedRide(rideId);
          if ((data['ride'] as Map?)?['id'] != rideId) {
            throw const FormatException('Recovered ride identity mismatch.');
          }
          final open = _open(data);
          if (open && recovered == null) recovered = data;
          // Remove only after an authenticated, validated server read. A failed
          // read retains the original operation for another recovery attempt.
          await journal.acknowledge(operation);
        } catch (_) {
          pendingRetry = true;
          break;
        }
      }
    } catch (_) {
      pendingRetry = true;
    }
    // Also recover a ride handed off before the process closed, or created on
    // another device. This GET never prepares another reservation.
    try {
      final data = await current.resumeRide();
      if (!data.containsKey('ride')) throw const FormatException('Missing ride field.');
      if (_open(data)) recovered = data;
    } catch (_) {
      pendingRetry = true;
    }
    return PreparationRecoveryResult(ride: recovered, pendingRetry: pendingRetry);
  }
}
