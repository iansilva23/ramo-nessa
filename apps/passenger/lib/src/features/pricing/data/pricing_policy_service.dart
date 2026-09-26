import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import '../../../core/network/json_response.dart';

class PassengerPricingPolicy {
  const PassengerPricingPolicy({
    required this.enabledCategories,
    required this.enabledZones,
    required this.buggyMinPassengers,
    required this.buggyMaxPassengers,
  });

  factory PassengerPricingPolicy.fromJson(Map<String, dynamic> json) {
    final categories = json['enabledCategories'];
    final zones = json['enabledZones'];
    final buggy = json['buggy'];

    if (
      categories is! List ||
      zones is! List ||
      buggy is! Map<String, dynamic>
    ) {
      throw const FormatException(
        'Política pública de preços inválida.',
      );
    }

    final minPassengers =
        (buggy['minPassengers'] as num?)?.toInt();
    final maxPassengers =
        (buggy['maxPassengers'] as num?)?.toInt();
    if (
      minPassengers == null ||
      maxPassengers == null ||
      minPassengers < 1 ||
      maxPassengers < minPassengers
    ) {
      throw const FormatException(
        'Limites do Buggy inválidos.',
      );
    }

    return PassengerPricingPolicy(
      enabledCategories: categories
          .whereType<String>()
          .map((value) => value.trim())
          .where((value) => value.isNotEmpty)
          .toSet(),
      enabledZones: zones
          .whereType<String>()
          .map((value) => value.trim())
          .where((value) => value.isNotEmpty)
          .toSet(),
      buggyMinPassengers: minPassengers,
      buggyMaxPassengers: maxPassengers,
    );
  }

  final Set<String> enabledCategories;
  final Set<String> enabledZones;
  final int buggyMinPassengers;
  final int buggyMaxPassengers;
}

abstract interface class PricingPolicyService {
  Future<PassengerPricingPolicy> load();
}

class HttpPricingPolicyService implements PricingPolicyService {
  HttpPricingPolicyService({
    required Uri baseUrl,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final http.Client _client;

  @override
  Future<PassengerPricingPolicy> load() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/pricing/policy'),
          headers: const {'accept': 'application/json'},
        )
        .timeout(RamoCoreConfig.requestTimeout);
    final decoded = decodeJsonObject(response.body);

    if (response.statusCode == 200 && decoded != null) {
      try {
        return PassengerPricingPolicy.fromJson(decoded);
      } catch (_) {
        throw const PricingPolicyException(
          'O servidor retornou uma política de serviços inválida.',
        );
      }
    }

    throw PricingPolicyException(
      apiErrorMessage(
        decoded,
        'Não conseguimos atualizar os serviços disponíveis agora.',
      ),
    );
  }
}

class PricingPolicyException implements Exception {
  const PricingPolicyException(this.message);

  final String message;

  @override
  String toString() => message;
}
