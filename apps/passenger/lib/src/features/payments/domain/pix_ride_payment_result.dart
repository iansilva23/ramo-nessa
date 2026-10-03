class PixRidePaymentResult {
  const PixRidePaymentResult({
    required this.internalPaymentId,
    required this.internalPaymentStatus,
    required this.orderId,
    required this.gatewayPaymentId,
    required this.status,
    required this.statusDetail,
    required this.ticketUrl,
    required this.qrCode,
    required this.qrCodeBase64,
  });

  factory PixRidePaymentResult.fromJson(Map<String, dynamic> json) {
    final payment = json['payment'];
    final pix = json['pix'];
    if (payment is! Map<String, dynamic> || pix is! Map<String, dynamic>) {
      throw const FormatException('Resposta Pix inválida.');
    }

    final internalPaymentId = payment['id'];
    final internalPaymentStatus = payment['status'];
    final orderId = pix['orderId'];
    final gatewayPaymentId = pix['paymentId'];
    if (internalPaymentId is! String ||
        internalPaymentStatus is! String ||
        orderId is! String ||
        gatewayPaymentId is! String) {
      throw const FormatException('Resposta Pix incompleta.');
    }

    return PixRidePaymentResult(
      internalPaymentId: internalPaymentId,
      internalPaymentStatus: internalPaymentStatus,
      orderId: orderId,
      gatewayPaymentId: gatewayPaymentId,
      status: pix['status'] is String ? pix['status'] as String : '',
      statusDetail:
          pix['statusDetail'] is String ? pix['statusDetail'] as String : '',
      ticketUrl: pix['ticketUrl'] is String ? pix['ticketUrl'] as String : '',
      qrCode: pix['qrCode'] is String ? pix['qrCode'] as String : '',
      qrCodeBase64:
          pix['qrCodeBase64'] is String ? pix['qrCodeBase64'] as String : '',
    );
  }

  final String internalPaymentId;
  final String internalPaymentStatus;
  final String orderId;
  final String gatewayPaymentId;
  final String status;
  final String statusDetail;
  final String ticketUrl;
  final String qrCode;
  final String qrCodeBase64;
}
