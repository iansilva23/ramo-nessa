import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import '../../../core/network/json_response.dart';
import '../domain/wallet_ride_payment_result.dart';
import 'passenger_payment_service.dart';

class HttpPassengerPaymentService implements PassengerPaymentService {
  HttpPassengerPaymentService({
    required Uri baseUrl,
    String? accessToken,
    String? passengerId,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _accessToken = accessToken ?? RamoCoreConfig.authToken,
        _passengerId = passengerId ?? RamoCoreConfig.devPassengerId,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _accessToken;
  final String _passengerId;
  final http.Client _client;

  Map<String, String> get _identityHeaders => {
        'content-type': 'application/json',
        if (_accessToken.trim().isNotEmpty)
          'authorization': 'Bearer ${_accessToken.trim()}'
        else if (_passengerId.trim().isNotEmpty)
          'x-dev-passenger-id': _passengerId.trim(),
      };

  @override
  Future<int> walletBalanceCents() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/wallet'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 200 && decoded != null) {
      final balance = decoded['balanceCents'];
      if (balance is num) return balance.toInt();

      throw const PassengerPaymentException(
        'O servidor retornou um saldo de carteira inválido.',
      );
    }

    throw PassengerPaymentException(
      apiErrorMessage(
        decoded,
        'Não conseguimos consultar a carteira agora.',
      ),
    );
  }

  @override
  Future<WalletRidePaymentResult> payRideWithWallet({
    required String rideId,
    required String idempotencyKey,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/rides/$rideId/payments'),
          headers: {
            ..._identityHeaders,
            'idempotency-key': idempotencyKey,
          },
          body: jsonEncode({'method': 'wallet'}),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 201 && decoded != null) {
      try {
        return WalletRidePaymentResult.fromJson(decoded);
      } catch (_) {
        throw const PassengerPaymentException(
          'O servidor retornou um pagamento inválido.',
        );
      }
    }

    throw PassengerPaymentException(
      apiErrorMessage(
        decoded,
        'Não conseguimos pagar com a carteira agora.',
      ),
    );
  }
}
