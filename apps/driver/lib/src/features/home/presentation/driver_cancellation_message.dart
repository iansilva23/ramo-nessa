import '../data/driver_api.dart';

String driverRideCancellationOutcomeMessage(
  DriverRideCancellationResult result,
) {
  final refundText = result.refundStatus == 'refunded'
      ? 'O passageiro foi reembolsado.'
      : result.refundStatus == 'not_charged'
          ? 'Nenhum valor havia sido cobrado.'
          : 'O reembolso do passageiro está em processamento.';

  String reviewText = '';
  if (result.adminReviewCreated) {
    reviewText = result.compensationReviewRequired
        ? ' O caso foi enviado para análise de possível compensação.'
        : ' A ocorrência foi enviada para análise.';
  } else if (result.adminReviewRequired) {
    reviewText = result.compensationReviewRequired
        ? ' A análise de possível compensação não foi registrada automaticamente. Abra o Suporte para solicitar revisão.'
        : ' A ocorrência precisava de análise, mas não foi registrada automaticamente. Abra o Suporte para solicitar revisão.';
  }

  return 'Corrida cancelada. $refundText$reviewText';
}
