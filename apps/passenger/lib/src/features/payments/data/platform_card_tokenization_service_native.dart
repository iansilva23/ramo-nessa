import 'package:flutter/material.dart';

import 'card_tokenization_service.dart';

CardTokenizationService createCardTokenizationService({
  required BuildContext context,
  required int amountCents,
  required DateTime holdExpiresAt,
  String? mercadoPagoPublicKey,
}) => NativeCardTokenizationService(
  amountCents: amountCents,
  mercadoPagoPublicKey: mercadoPagoPublicKey,
);
