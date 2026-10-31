import 'dart:convert';

import 'package:http/http.dart' as http;

class AgencyPromotion {
  const AgencyPromotion({
    required this.enabled,
    required this.title,
    required this.subtitle,
    required this.description,
    required this.ctaLabel,
    required this.updatedAt,
    this.ctaUrl,
  });

  factory AgencyPromotion.fromJson(Map<String, dynamic> json) {
    final enabled = json['enabled'];
    final title = json['title'];
    final subtitle = json['subtitle'];
    final description = json['description'];
    final ctaLabel = json['ctaLabel'];
    final updatedAt = json['updatedAt'];

    if (enabled is! bool ||
        title is! String ||
        subtitle is! String ||
        description is! String ||
        ctaLabel is! String ||
        updatedAt is! String) {
      throw const FormatException(
        'Divulgação da agência inválida.',
      );
    }

    return AgencyPromotion(
      enabled: enabled,
      title: title,
      subtitle: subtitle,
      description: description,
      ctaLabel: ctaLabel,
      ctaUrl: json['ctaUrl'] is String
          ? json['ctaUrl'] as String
          : null,
      updatedAt: DateTime.parse(updatedAt),
    );
  }

  final bool enabled;
  final String title;
  final String subtitle;
  final String description;
  final String ctaLabel;
  final String? ctaUrl;
  final DateTime updatedAt;
}

abstract interface class AgencyPromotionService {
  Future<AgencyPromotion> load();
}

class HttpAgencyPromotionService
    implements AgencyPromotionService {
  HttpAgencyPromotionService({
    required Uri baseUrl,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final http.Client _client;

  @override
  Future<AgencyPromotion> load() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/content/agency-promotion'),
          headers: {'accept': 'application/json'},
        )
        .timeout(const Duration(seconds: 10));

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const FormatException(
        'Não foi possível carregar a divulgação da agência.',
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException(
        'Resposta da agência inválida.',
      );
    }
    return AgencyPromotion.fromJson(decoded);
  }
}
