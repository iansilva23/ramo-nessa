import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../home/data/driver_api.dart';
import '../../home/domain/driver_models.dart';

class DriverStatementScreen extends StatefulWidget {
  const DriverStatementScreen({
    super.key,
    required this.api,
  });

  final DriverApi api;

  @override
  State<DriverStatementScreen> createState() => _DriverStatementScreenState();
}

class _DriverStatementScreenState extends State<DriverStatementScreen> {
  DriverFinanceStatement? _statement;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final statement = await widget.api.financeStatement();
      if (!mounted) return;
      setState(() {
        _statement = statement;
        _loading = false;
      });
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Não conseguimos carregar seu extrato agora.';
      });
    }
  }

  String _dateLabel(DateTime value) {
    final local = value.toLocal();
    final day = local.day.toString().padLeft(2, '0');
    final month = local.month.toString().padLeft(2, '0');
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$day/$month/${local.year} · $hour:$minute';
  }

  IconData _iconFor(DriverStatementItem item) {
    return switch (item.kind) {
      'RIDE_SETTLED' => Icons.directions_car_filled_rounded,
      'DRIVER_PAYOUT_RESERVED' => Icons.account_balance_rounded,
      'CASH_RIDE_COMMISSION_ACCRUED' => Icons.receipt_long_rounded,
      _ => Icons.swap_vert_rounded,
    };
  }

  String _amountLabel(DriverStatementItem item) {
    if (item.availableDeltaCents > 0) {
      return '+ ${formatCents(item.availableDeltaCents)}';
    }
    if (item.availableDeltaCents < 0) {
      return '- ${formatCents(item.availableDeltaCents.abs())}';
    }
    if (item.debtDeltaCents > 0) {
      return '+ ${formatCents(item.debtDeltaCents)} pendente';
    }
    return formatCents(0);
  }

  @override
  Widget build(BuildContext context) {
    final statement = _statement;

    return Scaffold(
      appBar: AppBar(title: const Text('Extrato de ganhos')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            RamoSpacing.lg,
            RamoSpacing.lg,
            RamoSpacing.lg,
            RamoSpacing.xxl,
          ),
          children: [
            if (_loading && statement == null)
              const Padding(
                padding: EdgeInsets.only(top: 80),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && statement == null) ...[
              const SizedBox(height: 48),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: RamoColors.muted),
              ),
              const SizedBox(height: RamoSpacing.md),
              FilledButton(
                onPressed: _load,
                child: const Text('Tentar novamente'),
              ),
            ] else if (statement != null) ...[
              Container(
                padding: const EdgeInsets.all(RamoSpacing.lg),
                decoration: BoxDecoration(
                  color: RamoColors.brandBlack,
                  borderRadius: BorderRadius.circular(RamoRadius.lg),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Disponível',
                      style: TextStyle(
                        color: Colors.white70,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      formatCents(
                        statement.finance.availableBalanceCents,
                      ),
                      style: Theme.of(context)
                          .textTheme
                          .headlineMedium
                          ?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                          ),
                    ),
                    const SizedBox(height: RamoSpacing.sm),
                    Text(
                      'Em processamento: '
                      '${formatCents(statement.finance.payoutPendingCents)}',
                      style: const TextStyle(
                        color: RamoColors.brandYellow,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (statement.finance.cashCommissionDebtCents > 0) ...[
                      const SizedBox(height: 4),
                      Text(
                        'Taxa de uso do app pendente: '
                        '${formatCents(statement.finance.cashCommissionDebtCents)}',
                        style: const TextStyle(
                          color: Colors.white70,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: RamoSpacing.xl),
              const Text(
                'Movimentações',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: RamoSpacing.sm),
              if (statement.items.isEmpty)
                const _EmptyStatement()
              else
                ...statement.items.map(
                  (item) => Padding(
                    padding: const EdgeInsets.only(
                      bottom: RamoSpacing.sm,
                    ),
                    child: Container(
                      padding: const EdgeInsets.all(RamoSpacing.md),
                      decoration: BoxDecoration(
                        color: RamoColors.surfaceRaised,
                        borderRadius:
                            BorderRadius.circular(RamoRadius.md),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CircleAvatar(
                            backgroundColor: Colors.white,
                            foregroundColor: RamoColors.brandBlack,
                            child: Icon(_iconFor(item)),
                          ),
                          const SizedBox(width: RamoSpacing.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment:
                                  CrossAxisAlignment.start,
                              children: [
                                Text(
                                  item.title,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  _dateLabel(item.createdAt),
                                  style: const TextStyle(
                                    color: RamoColors.muted,
                                    fontSize: 12,
                                  ),
                                ),
                                if (item.platformFeeCents > 0) ...[
                                  const SizedBox(height: 5),
                                  Text(
                                    'Taxa Ramo Nessa: '
                                    '${formatCents(item.platformFeeCents)}',
                                    style: const TextStyle(
                                      color: RamoColors.muted,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                                if (item.debtDeltaCents > 0) ...[
                                  const SizedBox(height: 5),
                                  Text(
                                    'Taxa pendente adicionada: '
                                    '${formatCents(item.debtDeltaCents)}',
                                    style: const TextStyle(
                                      color: RamoColors.muted,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                                if (item.debtDeltaCents < 0) ...[
                                  const SizedBox(height: 5),
                                  Text(
                                    'Taxa pendente compensada: '
                                    '${formatCents(item.debtDeltaCents.abs())}',
                                    style: const TextStyle(
                                      color: RamoColors.muted,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 5),
                                Text(
                                  'Saldo após: '
                                  '${formatCents(item.balanceAfterCents)}',
                                  style: const TextStyle(
                                    color: RamoColors.muted,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: RamoSpacing.sm),
                          Text(
                            _amountLabel(item),
                            textAlign: TextAlign.end,
                            style: TextStyle(
                              fontWeight: FontWeight.w900,
                              color: item.isCredit
                                  ? RamoColors.success
                                  : item.isDebit
                                      ? Theme.of(context)
                                          .colorScheme
                                          .error
                                      : null,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _EmptyStatement extends StatelessWidget {
  const _EmptyStatement();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(RamoSpacing.xl),
      decoration: BoxDecoration(
        color: RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(RamoRadius.md),
      ),
      child: const Column(
        children: [
          Icon(Icons.receipt_long_outlined, size: 36),
          SizedBox(height: RamoSpacing.sm),
          Text(
            'Nenhuma movimentação ainda',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          SizedBox(height: 4),
          Text(
            'Corridas concluídas, taxas e saques aparecerão aqui.',
            textAlign: TextAlign.center,
            style: TextStyle(color: RamoColors.muted),
          ),
        ],
      ),
    );
  }
}
