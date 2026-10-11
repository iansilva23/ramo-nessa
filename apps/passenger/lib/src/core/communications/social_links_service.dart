import 'dart:convert';

import 'package:http/http.dart' as http;

class AppSocialLinks {
  const AppSocialLinks({
    required this.updatedAt,
    this.instagramHandle,
    this.instagramUrl,
  });

  factory AppSocialLinks.fromJson(Map<String, dynamic> json) {
    final rawUpdatedAt = json['updatedAt'];
    if (rawUpdatedAt is! String) {
      throw const FormatException('Links sociais inválidos.');
    }

    final handle = json['instagramHandle'];
    final url = json['instagramUrl'];

    return AppSocialLinks(
      instagramHandle: handle is String && handle.trim().isNotEmpty
          ? handle.trim()
          : null,
      instagramUrl: url is String && url.trim().isNotEmpty
          ? url.trim()
          : null,
      updatedAt: DateTime.parse(rawUpdatedAt),
    );
  }

  final String? instagramHandle;
  final String? instagramUrl;
  final DateTime updatedAt;
}

abstract interface class SocialLinksService {
  Future<AppSocialLinks> load();
}

class HttpSocialLinksService implements SocialLinksService {
  HttpSocialLinksService({
    required Uri baseUrl,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final http.Client _client;

  @override
  Future<AppSocialLinks> load() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/content/social-links'),
          headers: {'accept': 'application/json'},
        )
        .timeout(const Duration(seconds: 10));

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const FormatException(
        'Não foi possível carregar os links sociais.',
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Resposta de links sociais inválida.');
    }
    return AppSocialLinks.fromJson(decoded);
  }
}
