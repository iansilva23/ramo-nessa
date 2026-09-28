import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/finance/presentation/driver_wallet_screen.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_models.dart';

void main() {
  const finance = DriverFinanceSummary(
    availableBalanceCents: 0,
    payoutPendingCents: 0,
  );

  DriverPayoutReservation payout(String status) {
    return DriverPayoutReservation(
      id: 'payout-status-test',
      amountCents: 11000,
      status: status,
      finance: finance,
      duplicateRequest: false,
    );
  }

  test('mensagem de saque reflete o status real do repasse Pix', () {
    expect(
      driverPayoutStatusMessage(payout('requested')),
      'Saque solicitado: R\$ 110,00.',
    );
    expect(
      driverPayoutStatusMessage(payout('processing')),
      'Saque em processamento: R\$ 110,00.',
    );
    expect(
      driverPayoutStatusMessage(payout('paid')),
      'Saque concluído: R\$ 110,00 enviado via Pix.',
    );
    expect(
      driverPayoutStatusMessage(payout('failed')),
      'O repasse Pix falhou e o valor voltou para seu saldo.',
    );
  });
}
