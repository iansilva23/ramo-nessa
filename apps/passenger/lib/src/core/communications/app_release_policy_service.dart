import 'dart:convert';

import 'package:http/http.dart' as http;

class AppReleasePolicy {
  const AppReleasePolicy({
    required this.latestVersion,
    required this.latestBuild,
    required this.minimumBuild,
    required this.currentBuild,
    required this.updateAvailable,
    required this.updateRequired,
    required this.updateMessage,
    this.storeUrl,
  });

  factory AppReleasePolicy.fromJson(Map<String, dynamic> json) {
    final latestVersion = json['latestVersion'];
    final latestBuild = json['latestBuild'];
    final minimumBuild = json['minimumBuild'];
    final currentBuild = json['currentBuild'];
    final updateAvailable = json['updateAvailable'];
    final updateRequired = json['updateRequired'];
    final updateMessage = json['updateMessage'];

    if (latestVersion is! String ||
        latestBuild is! num ||
        minimumBuild is! num ||
        currentBuild is! num ||
        updateAvailable is! bool ||
        updateRequired is! bool ||
        updateMessage is! String) {
      throw const FormatException(
        'Política de atualização inválida.',
      );
    }

    return AppReleasePolicy(
      latestVersion: latestVersion,
      latestBuild: latestBuild.toInt(),
      minimumBuild: minimumBuild.toInt(),
      currentBuild: currentBuild.toInt(),
      updateAvailable: updateAvailable,
      updateRequired: updateRequired,
      updateMessage: updateMessage,
      storeUrl: json['storeUrl'] is String
          ? json['storeUrl'] as String
          : null,
    );
  }

  final String latestVersion;
  final int latestBuild;
  final int minimumBuild;
  final int currentBuild;
  final bool updateAvailable;
  final bool updateRequired;
  final String updateMessage;
  final String? storeUrl;
}

abstract interface class AppReleasePolicyService {
  Future<AppReleasePolicy> check({
    required String appKind,
    required String platform,
    required int buildNumber,
  });
}

class HttpAppReleasePolicyService
    implements AppReleasePolicyService {
  HttpAppReleasePolicyService({
    required Uri baseUrl,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final http.Client _client;

  @override
  Future<AppReleasePolicy> check({
    required String appKind,
    required String platform,
    required int buildNumber,
  }) async {
    final uri = _baseUrl.resolve('/v1/app/release-policy').replace(
      queryParameters: {
        'app': appKind,
        'platform': platform,
        'build': buildNumber.toString(),
      },
    );

    final response = await _client
        .get(uri, headers: {'accept': 'application/json'})
        .timeout(const Duration(seconds: 10));

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const FormatException(
        'Não foi possível consultar a versão do app.',
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException(
        'Resposta de versão inválida.',
      );
    }
    return AppReleasePolicy.fromJson(decoded);
  }
}
