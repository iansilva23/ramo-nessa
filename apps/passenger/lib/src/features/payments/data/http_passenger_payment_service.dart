import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import '../../../core/network/json_response.dart';
import '../domain/card_ride_payment_result.dart';
import '../domain/cash_ride_authorization_result.dart';
import '../domain/passenger_payment_policy.dart';
import '../domain/pix_ride_payment_result.dart';
import '../domain/wallet_ride_payment_result.dart';
import 'passenger_payment_service.dart';

class HttpPassengerPaymentService implements PassengerPaymentService {
  HttpPassengerPaymentService({
    required Uri baseUrl,
    String? accessToken,
    String? passengerId,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _accessToken = accessToken ?? '',
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
  Future<PassengerPaymentPolicy> paymentPolicy() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/payments/policy'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 200 && decoded != null) {
      try {
        return PassengerPaymentPolicy.fromJson(decoded);
      } catch (_) {
        throw const PassengerPaymentException(
          'O servidor retornou uma política de pagamentos inválida.',
        );
      }
    }

    throw PassengerPaymentException(
      apiErrorMessage(
        decoded,
        'Não conseguimos consultar as formas de pagamento agora.',
      ),
    );
  }

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
  Future<PixRidePaymentResult> createPixRidePayment({
    required String rideId,
    required String idempotencyKey,
    required String payerEmail,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/rides/$rideId/payments'),
          headers: {
            ..._identityHeaders,
            'idempotency-key': idempotencyKey,
          },
          body: jsonEncode({
            'method': 'pix',
            'payerEmail': payerEmail.trim().toLowerCase(),
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 201 && decoded != null) {
      try {
        return PixRidePaymentResult.fromJson(decoded);
      } catch (_) {
        throw const PassengerPaymentException(
          'O servidor retornou um Pix inválido.',
        );
      }
    }

    throw PassengerPaymentException(
      apiErrorMessage(
        decoded,
        'Não conseguimos gerar o Pix agora.',
      ),
    );
  }

  @override
  Future<CardRidePaymentResult> createCardRidePayment({
    required String rideId,
    required String idempotencyKey,
    required String payerEmail,
    required String cardToken,
    required String paymentMethodId,
    required String paymentMethodType,
    int installments = 1,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/rides/$rideId/payments'),
          headers: {
            ..._identityHeaders,
            'idempotency-key': idempotencyKey,
          },
          body: jsonEncode({
            'method': 'card',
            'payerEmail': payerEmail.trim().toLowerCase(),
            'cardToken': cardToken,
            'paymentMethodId': paymentMethodId,
            'paymentMethodType': paymentMethodType,
            'installments': installments,
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 201 && decoded != null) {
      try {
        return CardRidePaymentResult.fromJson(decoded);
      } catch (_) {
        throw const PassengerPaymentException(
          'O servidor retornou um pagamento de cartão inválido.',
        );
      }
    }

    throw PassengerPaymentException(
      apiErrorMessage(
        decoded,
        'Não conseguimos processar o cartão agora.',
      ),
    );
  }

  @override
  Future<CashRideAuthorizationResult> authorizeCashRide({
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
          body: jsonEncode({'method': 'cash'}),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 201 && decoded != null) {
      try {
        return CashRideAuthorizationResult.fromJson(decoded);
      } catch (_) {
        throw const PassengerPaymentException(
          'O servidor retornou uma autorização em dinheiro inválida.',
        );
      }
    }

    throw PassengerPaymentException(
      apiErrorMessage(
        decoded,
        'Não conseguimos autorizar o pagamento em dinheiro agora.',
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
