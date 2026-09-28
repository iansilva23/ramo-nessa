class PassengerSupportTicket {
  const PassengerSupportTicket({
    required this.id,
    required this.category,
    required this.subject,
    required this.message,
    required this.status,
    required this.createdAt,
    this.response,
    this.respondedAt,
  });

  factory PassengerSupportTicket.fromJson(Map<String, dynamic> json) {
    return PassengerSupportTicket(
      id: json['id'] as String,
      category: json['category'] as String,
      subject: json['subject'] as String,
      message: json['message'] as String,
      status: json['status'] as String,
      response: json['response'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      respondedAt: json['respondedAt'] is String
          ? DateTime.parse(json['respondedAt'] as String)
          : null,
    );
  }

  final String id;
  final String category;
  final String subject;
  final String message;
  final String status;
  final String? response;
  final DateTime createdAt;
  final DateTime? respondedAt;
}

class PassengerSupportException implements Exception {
  const PassengerSupportException(this.message);
  final String message;

  @override
  String toString() => message;
}

abstract interface class PassengerSupportService {
  Future<List<PassengerSupportTicket>> listTickets();

  Future<PassengerSupportTicket> createTicket({
    required String category,
    required String subject,
    required String message,
  });
}
