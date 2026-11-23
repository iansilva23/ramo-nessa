/// An accepted ride uses the navigation arrow even before departure/payment.
/// Terminal, cancelled and unassigned states retain the regular vehicle icon.
bool usesDriverNavigationArrow(String? rideState) => const {
  'AWAITING_PAYMENT',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
}.contains(rideState);
