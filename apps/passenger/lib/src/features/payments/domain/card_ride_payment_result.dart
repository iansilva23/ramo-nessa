class CardRidePaymentResult {
  const CardRidePaymentResult({
    required this.internalPaymentId,
    required this.internalPaymentStatus,
    required this.orderId,
    required this.gatewayPaymentId,
    required this.status,
    required this.statusDetail,
    required this.paymentConfirmed,
    required this.rideState,
    this.challengeUrl,
  });

  final String internalPaymentId;
  final String internalPaymentStatus;
  final String orderId;
  final String gatewayPaymentId;
  final String status;
  final String statusDetail;
  final bool paymentConfirmed;
  final String rideState;
  final String? challengeUrl;

  factory CardRidePaymentResult.fromJson(Map<String, dynamic> json) {
    final payment = json['payment'];
    final card = json['card'];
    final ride = json['ride'];
    if (payment is! Map<String, dynamic> ||
        card is! Map<String, dynamic> ||
        ride is! Map<String, dynamic>) {
      throw const FormatException('Pagamento de cartão inválido.');
    }

    final internalPaymentId = payment['id'];
    final internalStatus = payment['status'];
    final orderId = card['orderId'];
    final gatewayPaymentId = card['paymentId'];
    final status = card['status'];
    final statusDetail = card['statusDetail'];
    final paymentConfirmed = json['paymentConfirmed'];
    final rideState = ride['state'];
    final challengeUrl = card['challengeUrl'];

    if (internalPaymentId is! String ||
        internalStatus is! String ||
        orderId is! String ||
        gatewayPaymentId is! String ||
        status is! String ||
        statusDetail is! String ||
        paymentConfirmed is! bool ||
        rideState is! String) {
      throw const FormatException('Pagamento de cartão inválido.');
    }

    return CardRidePaymentResult(
      internalPaymentId: internalPaymentId,
      internalPaymentStatus: internalStatus,
      orderId: orderId,
      gatewayPaymentId: gatewayPaymentId,
      status: status,
      statusDetail: statusDetail,
      paymentConfirmed: paymentConfirmed,
      rideState: rideState,
      challengeUrl:
          challengeUrl is String && challengeUrl.startsWith('https://')
              ? challengeUrl
              : null,
    );
  }
}
