import 'dart:io';

import 'package:flutter/services.dart';

class CardTokenizationResult {
  const CardTokenizationResult({
    required this.token,
    required this.paymentMethodId,
    required this.paymentMethodType,
    this.lastFourDigits,
  });

  final String token;
  final String paymentMethodId;
  final String paymentMethodType;
  final String? lastFourDigits;
}

abstract interface class CardTokenizationService {
  Future<CardTokenizationResult> tokenize();
}

class CardTokenizationException implements Exception {
  const CardTokenizationException(this.message);

  final String message;

  @override
  String toString() => message;
}

class NativeCardTokenizationService implements CardTokenizationService {
  const NativeCardTokenizationService({required this.amountCents});

  final int amountCents;

  static const _channel = MethodChannel(
    'br.com.ramonessa.passenger/payments',
  );

  @override
  Future<CardTokenizationResult> tokenize() async {
    if (amountCents <= 0) {
      throw const CardTokenizationException(
        'Valor da corrida inválido para pagamento por cartão.',
      );
    }

    if (!Platform.isAndroid) {
      throw const CardTokenizationException(
        'Cartão seguro ainda não está habilitado nesta plataforma.',
      );
    }

    try {
      final result = await _channel.invokeMapMethod<String, dynamic>(
        'tokenizeCard',
        {'amountCents': amountCents},
      );
      if (result == null) {
        throw const CardTokenizationException(
          'A tokenização do cartão foi cancelada.',
        );
      }

      final token = result['token'];
      final paymentMethodId = result['paymentMethodId'];
      final paymentMethodType = result['paymentMethodType'];
      final lastFourDigits = result['lastFourDigits'];

      if (token is! String ||
          token.length < 20 ||
          paymentMethodId is! String ||
          paymentMethodId.isEmpty ||
          paymentMethodType is! String ||
          (paymentMethodType != 'credit_card' &&
              paymentMethodType != 'debit_card')) {
        throw const CardTokenizationException(
          'O Mercado Pago retornou um cartão tokenizado inválido.',
        );
      }

      return CardTokenizationResult(
        token: token,
        paymentMethodId: paymentMethodId,
        paymentMethodType: paymentMethodType,
        lastFourDigits:
            lastFourDigits is String && lastFourDigits.isNotEmpty
                ? lastFourDigits
                : null,
      );
    } on PlatformException catch (error) {
      if (error.code == 'CARD_CANCELLED') {
        throw const CardTokenizationException(
          'Cadastro do cartão cancelado.',
        );
      }
      if (error.code == 'MERCADO_PAGO_NOT_CONFIGURED') {
        throw const CardTokenizationException(
          'Pagamento por cartão ainda não está configurado neste ambiente.',
        );
      }
      throw CardTokenizationException(
        error.message ?? 'Não conseguimos proteger os dados do cartão.',
      );
    } on MissingPluginException {
      throw const CardTokenizationException(
        'Pagamento por cartão ainda não está disponível nesta instalação.',
      );
    }
  }
}
