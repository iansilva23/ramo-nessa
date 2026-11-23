import 'package:flutter/material.dart';

Future<bool> confirmRideCancellation(
  BuildContext context, {
  required String description,
}) async {
  return await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Deseja cancelar a corrida?'),
          content: Text(description),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Continuar na corrida'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Sim, cancelar'),
            ),
          ],
        ),
      ) ==
      true;
}
