import 'saved_card_service.dart';
import 'card_tokenization_service.dart';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import '../../../core/network/json_response.dart';
import '../domain/card_ride_payment_result.dart';
import '../domain/cash_ride_authorization_result.dart';
import '../domain/passenger_payment_policy.dart';
import '../domain/passenger_promotion.dart';
import '../../rides/domain/prepared_ride.dart';
import '../domain/pix_ride_payment_result.dart';
import '../domain/wallet_ride_payment_result.dart';
import '../domain/wallet_topup_result.dart';
import 'passenger_payment_service.dart';
import '../../rides/data/driver_confirmation_service.dart';

class HttpPassengerPaymentService
    implements
        PassengerPaymentService,
        DriverConfirmationService,
        SavedCardService,
        PixEmailPaymentService {
  HttpPassengerPaymentService({
    required Uri baseUrl,
    String? accessToken,
    String? passengerId,
    String? clientInstanceId,
    http.Client? client,
  }) : _baseUrl = baseUrl,
       _accessToken = accessToken ?? '',
       _passengerId = passengerId ?? RamoCoreConfig.devPassengerId,
       _clientInstanceId = clientInstanceId ?? '',
       _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _accessToken;
  final String _passengerId;
  final String _clientInstanceId;
  final http.Client _client;
  String? _checkoutEmail;
  @override
  String? get checkoutEmail => _checkoutEmail;

  Map<String, String> get _identityHeaders => {
    'content-type': 'application/json',
    if (_accessToken.trim().isNotEmpty)
      'authorization': 'Bearer ${_accessToken.trim()}'
    else if (_passengerId.trim().isNotEmpty)
      'x-dev-passenger-id': _passengerId.trim(),
    if (_clientInstanceId.trim().isNotEmpty)
      'x-client-instance-id': _clientInstanceId.trim(),
  };

  @override
  Future<List<SavedPassengerCard>> savedCards() async {
    final response = await _client
        .get(_baseUrl.resolve('/v1/passenger/cards'), headers: _identityHeaders)
        .timeout(RamoCoreConfig.requestTimeout);
    final json = decodeJsonObject(response.body);
    if (response.statusCode != 200 || json == null) {
      throw PassengerPaymentException(
        apiErrorMessage(json, 'Não conseguimos carregar seus cartões.'),
      );
    }
    return (json['cards'] as List)
        .map(
          (card) => SavedPassengerCard.fromJson(card as Map<String, dynamic>),
        )
        .toList();
  }

  @override
  Future<SavedPassengerCard> saveCard({
    required String token,
    required String payerEmail,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/passenger/cards'),
          headers: _identityHeaders,
          body: jsonEncode({'token': token, 'payerEmail': payerEmail}),
        )
        .timeout(RamoCoreConfig.requestTimeout);
    final json = decodeJsonObject(response.body);
    if (response.statusCode != 201 || json == null) {
      throw PassengerPaymentException(
        apiErrorMessage(json, 'Não conseguimos salvar o cartão.'),
      );
    }
    return SavedPassengerCard.fromJson(json['card'] as Map<String, dynamic>);
  }

  @override
  Future<void> removeCard(String id) async {
    final response = await _client
        .delete(
          _baseUrl.resolve('/v1/passenger/cards/${Uri.encodeComponent(id)}'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);
    if (response.statusCode != 200) {
      throw PassengerPaymentException(
        apiErrorMessage(
          decodeJsonObject(response.body),
          'Não conseguimos remover o cartão.',
        ),
      );
    }
  }

  @override
  Future<CardRidePaymentResult> payWithCard({
    required String rideId,
    required String idempotencyKey,
    required CardTokenizationResult card,
    required String payerEmail,
    String? savedCardId,
  }) async {
    _checkoutEmail = payerEmail.trim();
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/rides/$rideId/payments'),
          headers: {..._identityHeaders, 'idempotency-key': idempotencyKey},
          body: jsonEncode({
            'method': 'card',
            'cardToken': card.token,
            'paymentMethodId': card.paymentMethodId,
            'paymentMethodType': card.paymentMethodType,
            'installments': 1,
            'payerEmail': payerEmail,
            if (savedCardId != null) 'savedCardId': savedCardId,
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);
    final json = decodeJsonObject(response.body);
    if (response.statusCode != 201 || json == null) {
      throw PassengerPaymentException(
        apiErrorMessage(json, 'Não conseguimos confirmar o pagamento.'),
      );
    }
    return CardRidePaymentResult.fromJson(json);
  }

  @override
  Future<void> requestDriverConfirmation(String rideId) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/rides/$rideId/driver-confirmation'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw PassengerPaymentException(
        apiErrorMessage(
          decodeJsonObject(response.body),
          'Não conseguimos consultar um motorista.',
        ),
      );
    }
  }

  @override
  Future<DriverConfirmation> driverConfirmation(String rideId) async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/rides/$rideId/driver-confirmation'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);
    final json = decodeJsonObject(response.body);
    if (response.statusCode != 200 || json == null) {
      throw PassengerPaymentException(
        apiErrorMessage(json, 'Não conseguimos atualizar a reserva.'),
      );
    }
    final driver = json['driver'];
    if (driver is Map<String, dynamic> && driver['photoPath'] is String) {
      driver['photoUrl'] = _baseUrl
          .resolve(driver['photoPath'] as String)
          .toString();
    }
    return DriverConfirmation.fromJson(json);
  }

  @override
  Future<void> releaseDriverReservation(String rideId) async {
    final response = await _client
        .delete(
          _baseUrl.resolve('/v1/rides/$rideId/driver-confirmation'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);
    if (response.statusCode != 200) {
      throw PassengerPaymentException(
        apiErrorMessage(
          decodeJsonObject(response.body),
          'Não conseguimos cancelar a reserva.',
        ),
      );
    }
  }

  @override
  Future<PassengerPaymentPolicy> paymentPolicy() async {
    final response = await _client
        .get(_baseUrl.resolve('/v1/payments/policy'), headers: _identityHeaders)
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
  Future<PassengerPromotionPreference?> promotionPreference() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/promotions/preference'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 200 && decoded != null) {
      final raw = decoded['preference'];
      if (raw == null) return null;
      if (raw is Map<String, dynamic>) {
        try {
          return PassengerPromotionPreference.fromJson(raw);
        } catch (_) {}
      }
      throw const PassengerPaymentException(
        'O servidor retornou um cupom salvo inválido.',
      );
    }
    throw PassengerPaymentException(
      apiErrorMessage(decoded, 'Não conseguimos consultar seu cupom agora.'),
    );
  }

  @override
  Future<PassengerPromotionSaveResult> savePromotionCode(String code) async {
    final response = await _client
        .put(
          _baseUrl.resolve('/v1/promotions/preference'),
          headers: _identityHeaders,
          body: jsonEncode({'code': code.trim()}),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 200 && decoded != null) {
      try {
        return PassengerPromotionSaveResult.fromJson(decoded);
      } catch (_) {
        throw const PassengerPaymentException(
          'O servidor retornou um cupom inválido.',
        );
      }
    }
    throw PassengerPaymentException(
      apiErrorMessage(decoded, 'Não conseguimos ativar esse cupom.'),
    );
  }

  @override
  Future<void> clearPromotionPreference() async {
    final response = await _client
        .delete(
          _baseUrl.resolve('/v1/promotions/preference'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);
    if (response.statusCode == 204) return;
    final decoded = decodeJsonObject(response.body);
    throw PassengerPaymentException(
      apiErrorMessage(decoded, 'Não conseguimos remover o cupom salvo.'),
    );
  }

  @override
  Future<PreparedRide> applyPromotionToRide({
    required String rideId,
    String? code,
  }) async {
    final response = await _client
        .put(
          _baseUrl.resolve('/v1/rides/$rideId/promotion'),
          headers: _identityHeaders,
          body: jsonEncode({
            if (code != null && code.trim().isNotEmpty) 'code': code.trim(),
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);
    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 200 && decoded != null) {
      try {
        return PreparedRide.fromJson(decoded);
      } catch (_) {
        throw const PassengerPaymentException(
          'O servidor retornou uma corrida promocional inválida.',
        );
      }
    }
    throw PassengerPaymentException(
      apiErrorMessage(decoded, 'Esse cupom não pôde ser aplicado à corrida.'),
    );
  }

  @override
  Future<PreparedRide> removePromotionFromRide(String rideId) async {
    final response = await _client
        .delete(
          _baseUrl.resolve('/v1/rides/$rideId/promotion'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);
    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 200 && decoded != null) {
      try {
        return PreparedRide.fromJson(decoded);
      } catch (_) {
        throw const PassengerPaymentException(
          'O servidor retornou uma corrida inválida.',
        );
      }
    }
    throw PassengerPaymentException(
      apiErrorMessage(decoded, 'Não conseguimos remover o cupom da corrida.'),
    );
  }

  @override
  Future<FullyPromotionalRidePaymentResult> confirmFullyPromotionalRide(
    String rideId,
  ) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/rides/$rideId/promotion/confirm'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);
    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 201 && decoded != null) {
      try {
        return FullyPromotionalRidePaymentResult.fromJson(decoded);
      } catch (_) {
        throw const PassengerPaymentException(
          'O servidor retornou uma confirmação promocional inválida.',
        );
      }
    }
    throw PassengerPaymentException(
      apiErrorMessage(
        decoded,
        'Não conseguimos confirmar a corrida promocional agora.',
      ),
    );
  }

  @override
  Future<int> walletBalanceCents() async {
    final response = await _client
        .get(_baseUrl.resolve('/v1/wallet'), headers: _identityHeaders)
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
      apiErrorMessage(decoded, 'Não conseguimos consultar a carteira agora.'),
    );
  }

  @override
  Future<PixWalletTopupResult> createPixWalletTopup({
    required int amountCents,
    required String idempotencyKey,
    required String payerEmail,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/wallet/topups'),
          headers: {..._identityHeaders, 'idempotency-key': idempotencyKey},
          body: jsonEncode({
            'method': 'pix',
            'amountCents': amountCents,
            'payerEmail': payerEmail,
          }),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 201 && decoded != null) {
      try {
        return PixWalletTopupResult.fromJson(decoded);
      } catch (_) {
        throw const PassengerPaymentException(
          'O servidor retornou uma recarga Pix inválida.',
        );
      }
    }

    throw PassengerPaymentException(
      apiErrorMessage(decoded, 'Não conseguimos gerar a recarga Pix agora.'),
    );
  }

  @override
  Future<WalletTopupStatus> walletTopupStatus(String topupId) async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/wallet/topups/$topupId'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 200 && decoded != null) {
      final topup = decoded['topup'];
      if (topup is Map<String, dynamic>) {
        try {
          return WalletTopupStatus.fromJson(topup);
        } catch (_) {}
      }
      throw const PassengerPaymentException(
        'O servidor retornou um status de recarga inválido.',
      );
    }

    throw PassengerPaymentException(
      apiErrorMessage(decoded, 'Não conseguimos consultar a recarga agora.'),
    );
  }

  @override
  Future<List<WalletTopupStatus>> walletTopups({int limit = 20}) async {
    final safeLimit = limit.clamp(1, 100);
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/wallet/topups?limit=$safeLimit'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 200 && decoded != null) {
      final raw = decoded['topups'];
      if (raw is List) {
        try {
          return raw
              .whereType<Map<String, dynamic>>()
              .map(WalletTopupStatus.fromJson)
              .toList(growable: false);
        } catch (_) {}
      }
      throw const PassengerPaymentException(
        'O servidor retornou um histórico de recargas inválido.',
      );
    }

    throw PassengerPaymentException(
      apiErrorMessage(
        decoded,
        'Não conseguimos consultar o histórico de recargas agora.',
      ),
    );
  }

  @override
  Future<PixRidePaymentResult> createPixRidePayment({required String rideId, required String idempotencyKey}) =>
    _createPix(rideId:rideId,idempotencyKey:idempotencyKey,payerEmail:_checkoutEmail);

  @override
  Future<PixRidePaymentResult> createPixWithEmail({required String rideId, required String idempotencyKey, required String payerEmail}) {
    _checkoutEmail = payerEmail.trim();
    return _createPix(rideId:rideId,idempotencyKey:idempotencyKey,payerEmail:_checkoutEmail);
  }

  Future<PixRidePaymentResult> _createPix({required String rideId,required String idempotencyKey,String? payerEmail}) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/rides/$rideId/payments'),
          headers: {..._identityHeaders, 'idempotency-key': idempotencyKey},
          body: jsonEncode({'method': 'pix', if(payerEmail != null) 'payerEmail':payerEmail}),
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

    final errorCode = decoded?['error'];
    throw PassengerPaymentException(
      apiErrorMessage(decoded, 'Não conseguimos gerar o Pix agora.'),
      code: errorCode is String ? errorCode : null,
    );
  }

  @override
  Future<CardRidePaymentResult> createCardRidePayment({
    required String rideId,
    required String idempotencyKey,
    required String cardToken,
    required String paymentMethodId,
    required String paymentMethodType,
    int installments = 1,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/rides/$rideId/payments'),
          headers: {..._identityHeaders, 'idempotency-key': idempotencyKey},
          body: jsonEncode({
            'method': 'card',
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
      apiErrorMessage(decoded, 'Não conseguimos processar o cartão agora.'),
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
          headers: {..._identityHeaders, 'idempotency-key': idempotencyKey},
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
          headers: {..._identityHeaders, 'idempotency-key': idempotencyKey},
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
      apiErrorMessage(decoded, 'Não conseguimos pagar com a carteira agora.'),
    );
  }
}
