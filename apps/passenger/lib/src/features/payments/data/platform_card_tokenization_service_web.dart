import 'package:flutter/material.dart';

import '../presentation/web_card_entry_screen.dart';
import 'card_tokenization_service.dart';
import 'saved_card_service.dart';

CardTokenizationService createCardTokenizationService({
  required BuildContext context,
  required int amountCents,
  required DateTime holdExpiresAt,
  String? mercadoPagoPublicKey,
}) => WebCardTokenizationService(
  context: context,
  amountCents: amountCents,
  holdExpiresAt: holdExpiresAt,
  publicKey: mercadoPagoPublicKey,
);

class WebCardTokenizationService
    implements
        CardTokenizationService,
        SavedCardTokenizationService,
        StorageCardTokenizationService {
  const WebCardTokenizationService({
    required this.context,
    required this.amountCents,
    required this.holdExpiresAt,
    this.publicKey,
  });

  final BuildContext context;
  final int amountCents;
  final DateTime holdExpiresAt;
  final String? publicKey;

  @override
  Future<CardTokenizationResult> tokenize() => _open();
  @override
  Future<CardTokenizationResult> tokenizeForStorage() => _open(save: true);
  @override
  Future<CardTokenizationResult> tokenizeSavedCard(SavedPassengerCard card) =>
      _open(card: card);

  Future<CardTokenizationResult> _open({
    bool save = false,
    SavedPassengerCard? card,
  }) async {
    final key = publicKey?.trim() ?? '';
    if (key.isEmpty || amountCents <= 0) {
      throw const CardTokenizationException(
        'Pagamento por cartão ainda não está configurado neste ambiente.',
      );
    }
    if (!context.mounted || !DateTime.now().isBefore(holdExpiresAt)) {
      throw const CardTokenizationException(
        'A reserva expirou. Volte e solicite novamente.',
      );
    }
    final result = await Navigator.of(context).push<CardTokenizationResult>(
      MaterialPageRoute(
        builder: (_) => WebCardEntryScreen(
          publicKey: key,
          amountCents: amountCents,
          holdExpiresAt: holdExpiresAt,
          requestStorageToken: save,
          savedCard: card,
        ),
      ),
    );
    if (result == null) {
      throw const CardTokenizationException('Cadastro do cartão cancelado.');
    }
    return result;
  }
}
