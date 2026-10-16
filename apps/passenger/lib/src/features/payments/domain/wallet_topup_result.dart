class WalletTopupStatus {
  const WalletTopupStatus({
    required this.id,
    required this.status,
    required this.amountCents,
    required this.createdAt,
    required this.updatedAt,
  });

  factory WalletTopupStatus.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final status = json['status'];
    final amountCents = json['amountCents'];
    final createdAt = json['createdAt'];
    final updatedAt = json['updatedAt'];

    if (id is! String ||
        status is! String ||
        amountCents is! num ||
        createdAt is! String ||
        updatedAt is! String) {
      throw const FormatException('Recarga inválida.');
    }

    return WalletTopupStatus(
      id: id,
      status: status,
      amountCents: amountCents.toInt(),
      createdAt: DateTime.parse(createdAt),
      updatedAt: DateTime.parse(updatedAt),
    );
  }

  final String id;
  final String status;
  final int amountCents;
  final DateTime createdAt;
  final DateTime updatedAt;

  bool get paid => status == 'paid';
  bool get pending =>
      status == 'created' || status == 'pending' || status == 'authorized';
  bool get terminalFailure =>
      status == 'failed' || status == 'cancelled' || status == 'refunded';
}

class PixWalletTopupResult {
  const PixWalletTopupResult({
    required this.topup,
    required this.orderId,
    required this.ticketUrl,
    required this.qrCode,
    required this.qrCodeBase64,
  });

  factory PixWalletTopupResult.fromJson(Map<String, dynamic> json) {
    final topup = json['topup'];
    final action = json['action'];
    if (topup is! Map<String, dynamic> ||
        action is! Map<String, dynamic> ||
        action['kind'] != 'pix') {
      throw const FormatException('Resposta de recarga Pix inválida.');
    }

    final orderId = action['orderId'];
    if (orderId is! String || orderId.trim().isEmpty) {
      throw const FormatException('Recarga Pix sem Order válida.');
    }

    return PixWalletTopupResult(
      topup: WalletTopupStatus.fromJson(topup),
      orderId: orderId,
      ticketUrl:
          action['ticketUrl'] is String ? action['ticketUrl'] as String : '',
      qrCode: action['qrCode'] is String ? action['qrCode'] as String : '',
      qrCodeBase64: action['qrCodeBase64'] is String
          ? action['qrCodeBase64'] as String
          : '',
    );
  }

  final WalletTopupStatus topup;
  final String orderId;
  final String ticketUrl;
  final String qrCode;
  final String qrCodeBase64;
}
