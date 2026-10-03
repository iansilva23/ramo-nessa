class DriverLegalDocument {
  const DriverLegalDocument({
    required this.documentType,
    required this.version,
    required this.title,
    required this.content,
    required this.effectiveAt,
    required this.accepted,
    this.acceptedAt,
  });

  factory DriverLegalDocument.fromJson(Map<String, dynamic> json) {
    return DriverLegalDocument(
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

class DriverPrivacyPreferences {
  const DriverPrivacyPreferences({
    required this.marketingNotificationsEnabled,
    this.updatedAt,
  });

  factory DriverPrivacyPreferences.fromJson(Map<String, dynamic> json) {
    return DriverPrivacyPreferences(
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

class DriverPrivacyRequest {
  const DriverPrivacyRequest({
    required this.id,
    required this.requestType,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.note,
    this.response,
    this.respondedAt,
  });

  factory DriverPrivacyRequest.fromJson(Map<String, dynamic> json) {
    return DriverPrivacyRequest(
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

class DriverPrivacyOverview {
  const DriverPrivacyOverview({
    required this.legalDocuments,
    required this.preferences,
    required this.requests,
  });

  factory DriverPrivacyOverview.fromJson(Map<String, dynamic> json) {
    final documents = json['legalDocuments'];
    final preferences = json['preferences'];
    final requests = json['requests'];

    if (
      documents is! List ||
      preferences is! Map ||
      requests is! List
    ) {
      throw const DriverPrivacyException(
        'Resposta de privacidade inválida.',
      );
    }

    return DriverPrivacyOverview(
      legalDocuments: documents
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .map(DriverLegalDocument.fromJson)
          .toList(growable: false),
      preferences: DriverPrivacyPreferences.fromJson(
        Map<String, dynamic>.from(preferences),
      ),
      requests: requests
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .map(DriverPrivacyRequest.fromJson)
          .toList(growable: false),
    );
  }

  final List<DriverLegalDocument> legalDocuments;
  final DriverPrivacyPreferences preferences;
  final List<DriverPrivacyRequest> requests;
}

class DriverPrivacyException implements Exception {
  const DriverPrivacyException(this.message);

  final String message;

  @override
  String toString() => message;
}

abstract interface class DriverPrivacyService {
  Future<DriverPrivacyOverview> overview();

  Future<void> acceptLegalDocument({
    required String documentType,
    required int version,
  });

  Future<DriverPrivacyPreferences> updateMarketingNotifications(
    bool enabled,
  );

  Future<DriverPrivacyRequest> createRequest({
    required String requestType,
    String? note,
  });
}
