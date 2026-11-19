class PassengerLegalDocument {
  const PassengerLegalDocument({
    required this.documentType,
    required this.version,
    required this.title,
    required this.content,
    required this.effectiveAt,
    required this.accepted,
    this.acceptedAt,
  });

  factory PassengerLegalDocument.fromJson(Map<String, dynamic> json) {
    return PassengerLegalDocument(
      documentType: json['documentType'] as String,
      version: json['version'] as int,
      title: json['title'] as String,
      content: json['content'] as String,
      effectiveAt: DateTime.parse(json['effectiveAt'] as String),
      accepted: json['accepted'] == true,
      acceptedAt: json['acceptedAt'] is String
          ? DateTime.parse(json['acceptedAt'] as String)
          : null,
    );
  }

  final String documentType;
  final int version;
  final String title;
  final String content;
  final DateTime effectiveAt;
  final bool accepted;
  final DateTime? acceptedAt;
}

class PassengerPrivacyPreferences {
  const PassengerPrivacyPreferences({
    required this.marketingNotificationsEnabled,
    this.updatedAt,
  });

  factory PassengerPrivacyPreferences.fromJson(Map<String, dynamic> json) {
    return PassengerPrivacyPreferences(
      marketingNotificationsEnabled:
          json['marketingNotificationsEnabled'] == true,
      updatedAt: json['updatedAt'] is String
          ? DateTime.parse(json['updatedAt'] as String)
          : null,
    );
  }

  final bool marketingNotificationsEnabled;
  final DateTime? updatedAt;
}

class PassengerPrivacyRequest {
  const PassengerPrivacyRequest({
    required this.id,
    required this.requestType,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.note,
    this.response,
    this.respondedAt,
  });

  factory PassengerPrivacyRequest.fromJson(Map<String, dynamic> json) {
    return PassengerPrivacyRequest(
      id: json['id'] as String,
      requestType: json['requestType'] as String,
      status: json['status'] as String,
      note: json['note'] as String?,
      response: json['response'] as String?,
      respondedAt: json['respondedAt'] is String
          ? DateTime.parse(json['respondedAt'] as String)
          : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  final String id;
  final String requestType;
  final String status;
  final String? note;
  final String? response;
  final DateTime? respondedAt;
  final DateTime createdAt;
  final DateTime updatedAt;
}

class PassengerPrivacyOverview {
  const PassengerPrivacyOverview({
    required this.legalDocuments,
    required this.preferences,
    required this.requests,
  });

  factory PassengerPrivacyOverview.fromJson(Map<String, dynamic> json) {
    final documents = json['legalDocuments'];
    final preferences = json['preferences'];
    final requests = json['requests'];
    if (
      documents is! List ||
      preferences is! Map ||
      requests is! List
    ) {
      throw const PassengerPrivacyException(
        'Resposta de privacidade inválida.',
      );
    }

    return PassengerPrivacyOverview(
      legalDocuments: documents
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .map(PassengerLegalDocument.fromJson)
          .toList(growable: false),
      preferences: PassengerPrivacyPreferences.fromJson(
        Map<String, dynamic>.from(preferences),
      ),
      requests: requests
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .map(PassengerPrivacyRequest.fromJson)
          .toList(growable: false),
    );
  }

  final List<PassengerLegalDocument> legalDocuments;
  final PassengerPrivacyPreferences preferences;
  final List<PassengerPrivacyRequest> requests;
}

class PassengerPrivacyException implements Exception {
  const PassengerPrivacyException(this.message);

  final String message;

  @override
  String toString() => message;
}

abstract interface class PassengerPrivacyService {
  Future<PassengerPrivacyOverview> overview();

  Future<void> acceptLegalDocument({
    required String documentType,
    required int version,
  });

  Future<PassengerPrivacyPreferences> updateMarketingNotifications(
    bool enabled,
  );

  Future<PassengerPrivacyRequest> createRequest({
    required String requestType,
    String? note,
  });
}
