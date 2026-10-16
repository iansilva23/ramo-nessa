import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_api.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/driver_cancellation_message.dart';

void main() {
  test('confirma análise de compensação apenas quando persistida', () {
    const result = DriverRideCancellationResult(
      refundStatus: 'refunded',
      adminReviewRequired: true,
      adminReviewCreated: true,
      compensationReviewRequired: true,
      duplicateCancellation: false,
    );

    final message = driverRideCancellationOutcomeMessage(result);

    expect(message, contains('foi enviado para análise'));
    expect(message, contains('possível compensação'));
    expect(message, isNot(contains('não foi registrada automaticamente')));
  });

  test('não promete análise quando o chamado não foi criado', () {
    const result = DriverRideCancellationResult(
      refundStatus: 'refunded',
      adminReviewRequired: true,
      adminReviewCreated: false,
      compensationReviewRequired: true,
      duplicateCancellation: false,
    );

    final message = driverRideCancellationOutcomeMessage(result);

    expect(message, isNot(contains('será analisada')));
    expect(message, contains('não foi registrada automaticamente'));
    expect(message, contains('Abra o Suporte'));
  });

  test('cancelamento comum não menciona análise administrativa', () {
    const result = DriverRideCancellationResult(
      refundStatus: 'pending_external_gateway',
      adminReviewRequired: false,
      adminReviewCreated: false,
      compensationReviewRequired: false,
      duplicateCancellation: false,
    );

    final message = driverRideCancellationOutcomeMessage(result);

    expect(message, contains('reembolso do passageiro está em processamento'));
    expect(message, isNot(contains('análise')));
    expect(message, isNot(contains('Suporte')));
  });
}
