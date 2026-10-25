import 'package:flutter/material.dart';

import '../foundation/ramo_colors.dart';

class RamoRideActivityData {
  const RamoRideActivityData({
    required this.id,
    required this.state,
    required this.origin,
    required this.destination,
    required this.category,
    required this.amountCents,
    this.paymentMethod,
    this.cancellationState,
    this.paymentStatus,
    this.participant,
    this.vehicle,
    this.date,
  });
  final String id, state, origin, destination, category;
  final int amountCents;
  final String? paymentMethod, paymentStatus, participant, vehicle, cancellationState;
  final DateTime? date;
  bool get terminal =>
      state == 'COMPLETED' ||
      state.startsWith('CANCELLED_') ||
      const {
        'REFUNDED',
        'REFUND_PENDING',
        'PAYMENT_FAILED',
        'EXPIRED',
      }.contains(state);
  bool get awaitingPayment =>
      paymentMethod != 'cash' && const {'CREATED', 'AWAITING_PAYMENT', 'PAYMENT_FAILED'}.contains(state);
  String get reference => id.length > 8 ? id.substring(0, 8).toUpperCase() : id;
  String get amount =>
      'R\$ ${(amountCents / 100).toStringAsFixed(2).replaceAll('.', ',')}';
  String get categoryLabel => switch (category) {
        'moto' => 'Moto',
        'car' => 'Carro',
        'comfort_black' => 'Comfort / Black',
        'buggy' => 'Buggy',
        'delivery' => 'Entrega',
        _ => category,
      };
  String get statusLabel => switch (state) {
        'DRIVER_ARRIVED' => 'No embarque',
        'IN_PROGRESS' => 'Em trajeto',
        'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' => 'A caminho do embarque',
        'PAID' || 'SEARCHING_DRIVER' => 'Procurando motorista',
        'NO_DRIVER_FOUND' => 'Aguardando sua decisão',
        'CREATED' || 'AWAITING_PAYMENT' => paymentMethod == 'cash' ? 'Confirmação pendente' : 'Aguardando pagamento',
        'CANCELLED_BY_DRIVER' => 'Cancelada pelo motorista',
        'CANCELLED_BY_PASSENGER' => 'Cancelada pelo passageiro',
        'CANCELLED_BY_ADMIN' => 'Cancelada pelo suporte',
        'EXPIRED' => 'Solicitação expirada',
        'COMPLETED' => 'Concluída',
        'REFUNDED' => 'Reembolsada',
        'REFUND_PENDING' => 'Reembolso em andamento',
        'PAYMENT_FAILED' => 'Pagamento não aprovado',
        _ =>
          state.startsWith('CANCELLED_') ? 'Cancelada' : 'Atualizando corrida',
      };
  String get paymentLabel {
    if (state == 'EXPIRED' && paymentMethod == null && paymentStatus == 'created') return 'Sem pagamento registrado';
    final method = switch (paymentMethod) {
      'pix' => 'Pix',
      'wallet' => 'Carteira',
      'cash' => 'Dinheiro',
      'card' => 'Cartão',
      _ => 'Pagamento',
    };
    if (paymentMethod == 'cash') return terminal ? 'Dinheiro · corrida encerrada' : 'Dinheiro · pagamento presencial';
    return switch (paymentStatus) {
      'paid' => '$method confirmado',
      'authorized' => '$method autorizado',
      'refunded' => '$method reembolsado',
      'pending' || 'created' => '$method pendente',
      'failed' => '$method não aprovado',
      _ => method,
    };
  }
}

class RamoRideActivityCard extends StatelessWidget {
  const RamoRideActivityCard({
    super.key,
    required this.ride,
    required this.onOpen,
    required this.onHelp,
    this.driver = false,
    this.identity,
    this.busy = false,
  });
  final RamoRideActivityData ride;
  final VoidCallback? onOpen, onHelp;
  final bool driver, busy;
  final Widget? identity;
  String get title => switch (ride.state) {
        'DRIVER_ARRIVED' =>
          driver ? 'Aguardando o embarque' : 'Seu motorista informou a chegada',
        'IN_PROGRESS' => 'A caminho do destino',
        'DRIVER_ASSIGNED' ||
        'DRIVER_ARRIVING' =>
          driver ? 'Vá ao ponto de embarque' : 'Seu motorista está a caminho',
        _ => ride.statusLabel,
      };
  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final active = !ride.terminal;
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: colors.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              color: active
                  ? Color.alphaBlend(
                      RamoColors.brandYellow.withValues(alpha: .18),
                      colors.surface,
                    )
                  : colors.surfaceContainerLow,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        ride.state == 'IN_PROGRESS'
                            ? Icons.navigation_outlined
                            : Icons.route_outlined,
                        size: 16,
                      ),
                      const SizedBox(width: 7),
                      Expanded(
                        child: Text(
                          ride.statusLabel,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Text(
                        '#${ride.reference}',
                        style: TextStyle(
                          fontSize: 11,
                          color: colors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -.5,
                    ),
                  ),
                  if (active) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: List.generate(5, (i) {
                        final step = switch (ride.state) {
                          'IN_PROGRESS' => 4,
                          'DRIVER_ARRIVED' => 3,
                          'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' => 2,
                          _ => 1,
                        };
                        return Expanded(
                          child: Container(
                            height: 4,
                            margin: EdgeInsets.only(right: i == 4 ? 0 : 5),
                            decoration: BoxDecoration(
                              color: i < step
                                  ? colors.onSurface
                                  : colors.outlineVariant,
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                        );
                      }),
                    ),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  RamoRideRoute(ride: ride),
                  const SizedBox(height: 16),
                  if (identity != null)
                    identity!
                  else if (ride.participant != null) ...[
                    const Divider(),
                    Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: colors.surfaceContainerHighest,
                          child: Icon(
                            driver
                                ? Icons.person_outline
                                : Icons.sports_motorsports_outlined,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                ride.participant!,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              Text(
                                ride.vehicle ?? ride.categoryLabel,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: colors.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                  const Divider(height: 28),
                  Row(
                    children: [
                      Icon(
                        ride.paymentStatus == 'paid'
                            ? Icons.check_circle_outline
                            : Icons.payments_outlined,
                        size: 16,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          ride.paymentLabel,
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        ride.amount,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: busy ? null : onOpen,
                          style: FilledButton.styleFrom(
                            backgroundColor: RamoColors.brandYellow,
                            foregroundColor: Colors.black,
                            minimumSize: const Size(0, 46),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(11),
                            ),
                          ),
                          icon: Icon(
                            active
                                ? Icons.navigation_outlined
                                : Icons.receipt_long_outlined,
                            size: 17,
                          ),
                          label: Text(
                            active
                                ? (ride.awaitingPayment
                                    ? 'Ver pagamento'
                                    : driver
                                        ? 'Retomar corrida'
                                        : 'Acompanhar')
                                : 'Ver corrida',
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: onHelp,
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 46),
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(11),
                          ),
                        ),
                        icon: const Icon(Icons.headset_mic_outlined, size: 17),
                        label: const Text('Ajuda'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class RamoRideRoute extends StatelessWidget {
  const RamoRideRoute({super.key, required this.ride});
  final RamoRideActivityData ride;
  @override
  Widget build(BuildContext context) => Column(
        children: [
          _place(context, Icons.my_location_outlined, 'Embarque', ride.origin),
          const SizedBox(height: 14),
          _place(
              context, Icons.location_on_outlined, 'Destino', ride.destination),
        ],
      );
  Widget _place(
    BuildContext context,
    IconData icon,
    String label,
    String value,
  ) =>
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Icon(icon, size: 17),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
                Text(value, style: const TextStyle(fontSize: 13)),
              ],
            ),
          ),
        ],
      );
}

class RamoRideDetailsScreen extends StatelessWidget {
  const RamoRideDetailsScreen({
    super.key,
    required this.ride,
    required this.onHelp,
  });
  final RamoRideActivityData ride;
  final VoidCallback? onHelp;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Detalhes da corrida')),
        body: ListView(
          padding: const EdgeInsets.all(22),
          children: [
            Text(
              ride.statusLabel,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            if (ride.cancellationState != null && ride.cancellationState != ride.state)
              Text(switch (ride.cancellationState) {
                'CANCELLED_BY_DRIVER' => 'Cancelada pelo motorista',
                'CANCELLED_BY_ADMIN' => 'Cancelada pelo suporte',
                'CANCELLED_BY_PASSENGER' => 'Cancelada pelo passageiro',
                _ => 'Corrida cancelada',
              }),
            SelectableText('Corrida ${ride.id}'),
            if (ride.date != null)
              Text(
                MaterialLocalizations.of(context)
                    .formatFullDate(ride.date!.toLocal()),
              ),
            const SizedBox(height: 24),
            RamoRideRoute(ride: ride),
            const Divider(height: 36),
            if (ride.participant != null) Text(ride.participant!),
            if (ride.vehicle != null) Text(ride.vehicle!),
            Text('${ride.categoryLabel} · ${ride.paymentLabel}'),
            Text(ride.amount, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: onHelp,
              icon: const Icon(Icons.headset_mic_outlined),
              label: const Text('Ajuda com esta corrida'),
            ),
          ],
        ),
      );
}

class RamoRideActivityTabs extends StatelessWidget {
  const RamoRideActivityTabs(
      {super.key,
      required this.activeCount,
      required this.history,
      required this.onChanged});
  final int activeCount;
  final bool history;
  final ValueChanged<bool> onChanged;
  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    Widget tab(String label, bool value) => DecoratedBox(
        decoration: BoxDecoration(
            border: Border(
                bottom: BorderSide(
                    color: history == value
                        ? colors.onSurface
                        : Colors.transparent,
                    width: 2))),
        child: Semantics(
            selected: history == value,
            child: TextButton(
                onPressed: () => onChanged(value),
                style: TextButton.styleFrom(
                    foregroundColor: history == value
                        ? colors.onSurface
                        : colors.onSurfaceVariant,
                    textStyle: TextStyle(
                        fontSize: 13,
                        fontWeight: history == value
                            ? FontWeight.w600
                            : FontWeight.w400),
                    minimumSize: const Size(0, 48),
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    shape: const RoundedRectangleBorder()),
                child: Text(label))));
    return Row(children: [
      Expanded(flex: 3, child: tab('Em andamento · $activeCount', false)),
      const SizedBox(width: 16),
      Expanded(flex: 2, child: tab('Histórico', true))
    ]);
  }
}
