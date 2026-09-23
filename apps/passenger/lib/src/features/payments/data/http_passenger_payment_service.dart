import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import '../domain/wallet_ride_payment_result.dart';
import 'passenger_payment_service.dart';

class HttpPassengerPaymentService implements PassengerPaymentService {
  HttpPassengerPaymentService({
    required Uri baseUrl,
    required String passengerId,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _passengerId = passengerId,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _passengerId;
  final http.Client _client;

  Map<String, String> get _identityHeaders => {
        'content-type': 'application/json',
        'x-dev-passenger-id': _passengerId,
      };

  @override
  Future<int> walletBalanceCents() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/wallet'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = jsonDecode(response.body);
    if (response.statusCode == 200 && decoded is Map<String, dynamic>) {
      return (decoded['balanceCents'] as num).toInt();
    }

    throw PassengerPaymentException(
      decoded is Map<String, dynamic>
          ? decoded['message'] as String? ??
              'Não conseguimos consultar a carteira agora.'
          : 'Não conseguimos consultar a carteira agora.',
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

    final decoded = jsonDecode(response.body);
    if (response.statusCode == 201 && decoded is Map<String, dynamic>) {
      return WalletRidePaymentResult.fromJson(decoded);
    }

    throw PassengerPaymentException(
      decoded is Map<String, dynamic>
          ? decoded['message'] as String? ??
              'Não conseguimos pagar com a carteira agora.'
          : 'Não conseguimos pagar com a carteira agora.',
    );
  }
}
