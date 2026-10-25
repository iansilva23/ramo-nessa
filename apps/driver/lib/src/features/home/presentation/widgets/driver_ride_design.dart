part of '../driver_home_screen.dart';

const _rideInk = Color(0xFF080A0B);
const _rideMuted = Color(0xFF70747D);
const _rideGrey = Color(0xFFF4F4F6);
const _rideYellow = Color(0xFFFFD600);

// A floating notification is deliberately distinct from the in-ride docked
// surface. On phones the docked surface reaches the map viewport edges;
// only wide layouts apply a reading-width limit.
class _DriverDesignFrame extends StatelessWidget {
  const _DriverDesignFrame({
    required this.header,
    required this.body,
    required this.actions,
    required this.onMinimize,
    this.darkHeader = false,
    this.floating = false,
  });

  final Widget header, body, actions;
  final VoidCallback onMinimize;
  final bool darkHeader, floating;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final wide = MediaQuery.sizeOf(context).width >= 700;
      final scrollHeader = constraints.maxHeight < 360;
      final horizontalPadding = floating ? 14.0 : 18.0;
      final radius = floating || wide
          ? BorderRadius.circular(28)
          : const BorderRadius.vertical(top: Radius.circular(28));
      final heading = Container(
        color: darkHeader ? _rideInk : Colors.white,
        padding: EdgeInsets.fromLTRB(horizontalPadding, 0, horizontalPadding, 12),
        child: header,
      );
      final details = Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: darkHeader
              ? const BorderRadius.vertical(top: Radius.circular(24))
              : null,
        ),
        padding: EdgeInsets.fromLTRB(horizontalPadding, 0, horizontalPadding, 10),
        child: body,
      );

      // Align is outside the pointer interceptor: unpainted map regions must
      // remain interactive on Flutter Web with the HTML map underneath.
      return Align(
        alignment: Alignment.bottomCenter,
        child: RamoWebMapOverlay(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: wide ? (floating ? 480 : 620) : constraints.maxWidth,
              maxHeight: constraints.maxHeight,
            ),
            child: Theme(
              data: Theme.of(context).copyWith(
                colorScheme: Theme.of(context).colorScheme.copyWith(
                  surface: Colors.white,
                  onSurface: _rideInk,
                  onSurfaceVariant: _rideMuted,
                ),
              ),
              child: DefaultTextStyle(
                style: const TextStyle(
                  color: _rideInk,
                  fontSize: 14,
                  fontFamily: 'Roboto',
                  height: 1.2,
                ),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: darkHeader ? _rideInk : Colors.white,
                    borderRadius: radius,
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x22000000),
                        blurRadius: 20,
                        offset: Offset(0, 6),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    key: ValueKey(
                      floating ? 'driver-surface-floating' : 'driver-surface-docked',
                    ),
                    borderRadius: radius,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Semantics(
                          label: 'Minimizar informações',
                          button: true,
                          onTap: onMinimize,
                          child: GestureDetector(
                            key: const ValueKey('ride-drag-handle'),
                            behavior: HitTestBehavior.opaque,
                            onVerticalDragEnd: (details) {
                              if ((details.primaryVelocity ?? 0) > 250) {
                                onMinimize();
                              }
                            },
                            onVerticalDragUpdate: (details) {
                              if (details.localPosition.dy > 55 &&
                                  details.delta.dy > 0) {
                                onMinimize();
                              }
                            },
                            child: SizedBox(
                              height: 26,
                              width: double.infinity,
                              child: Center(
                                child: Container(
                                  width: 34,
                                  height: 4,
                                  decoration: BoxDecoration(
                                    color: darkHeader
                                        ? Colors.white70
                                        : const Color(0xFF8A8B90),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        if (!scrollHeader) heading,
                        Flexible(
                          fit: FlexFit.loose,
                          child: SingleChildScrollView(
                            key: const ValueKey('ride-secondary-scroll'),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [if (scrollHeader) heading, details],
                            ),
                          ),
                        ),
                        Container(
                          color: Colors.white,
                          padding: EdgeInsets.fromLTRB(
                            horizontalPadding,
                            2,
                            horizontalPadding,
                            floating ? 14 : 18,
                          ),
                          child: actions,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    },
  );
}

class _RideButton extends StatelessWidget {
  const _RideButton(
    this.label,
    this.onPressed, {
    this.primary = false,
    this.icon,
    this.leading,
    this.compact = false,
  });
  final String label;
  final VoidCallback? onPressed;
  final bool primary, compact;
  final IconData? icon;
  final Widget? leading;
  @override
  Widget build(BuildContext context) {
    final content = Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (leading != null) ...[leading!, const SizedBox(width: 7)],
        if (leading == null && icon != null && MediaQuery.sizeOf(context).width >= 375) ...[
          Icon(icon, size: compact ? 18 : 22),
          const SizedBox(width: 7),
        ],
        Flexible(
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: compact ? 11 : 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
    final style = ButtonStyle(
      minimumSize: WidgetStatePropertyAll(Size(0, compact ? 40 : 52)),
      padding: const WidgetStatePropertyAll(
        EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      ),
      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      shape: WidgetStatePropertyAll(
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      foregroundColor: WidgetStateProperty.resolveWith(
        (states) =>
            states.contains(WidgetState.disabled) ? _rideMuted : _rideInk,
      ),
      backgroundColor: WidgetStatePropertyAll(
        primary ? _rideYellow : Colors.white,
      ),
      side: WidgetStatePropertyAll(
        BorderSide(color: primary ? Colors.transparent : _rideInk, width: .7),
      ),
    );
    return OutlinedButton(onPressed: onPressed, style: style, child: content);
  }
}

Widget _ridePair(Widget left, Widget right) => Row(
  children: [
    Expanded(child: left),
    const SizedBox(width: 8),
    Expanded(child: right),
  ],
);

Widget _rideCategory(String label) => Container(
  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
  decoration: BoxDecoration(
    color: const Color(0xFFECEDEF),
    borderRadius: BorderRadius.circular(24),
  ),
  child: Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      const Icon(
        Icons.directions_car_filled_rounded,
        size: 19,
        color: _rideInk,
      ),
      const SizedBox(width: 6),
      Flexible(
        child: Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
        ),
      ),
    ],
  ),
);

Widget _rideHeading(
  String title,
  String subtitle,
  String category, {
  bool done = false,
  bool compact = false,
}) => Row(
  children: [
    Container(
      width: 40,
      height: 40,
      decoration: const BoxDecoration(
        color: _rideYellow,
        shape: BoxShape.circle,
      ),
      child: Icon(
        done ? Icons.check_rounded : Icons.near_me_rounded,
        color: _rideInk,
        size: 26,
      ),
    ),
    const SizedBox(width: 10),
    Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 3),
          Text(
            subtitle,
            style: const TextStyle(color: _rideMuted, fontSize: 13),
          ),
        ],
      ),
    ),
    if (!done) ...[
      const SizedBox(width: 6),
      ConstrainedBox(
        constraints: BoxConstraints(maxWidth: compact ? 112 : 148),
        child: _rideCategory(category),
      ),
    ],
  ],
);

class _RideRouteBlock extends StatelessWidget {
  const _RideRouteBlock({
    required this.origin,
    required this.destination,
    this.originLabel = 'EMBARQUE',
    this.pickupDistance,
    this.tripDistance,
  });
  final String origin, destination, originLabel;
  final String? pickupDistance, tripDistance;
  Widget _stop(
    String label,
    String value,
    String? distance,
    bool pickup,
  ) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Container(
        width: 26,
        height: 26,
        decoration: BoxDecoration(
          color: pickup ? _rideYellow : _rideInk,
          shape: BoxShape.circle,
        ),
        child: Icon(
          Icons.location_on_rounded,
          size: 20,
          color: pickup ? _rideInk : Colors.white,
        ),
      ),
      const SizedBox(width: 14),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(
                color: _rideMuted,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
            ),
          ],
        ),
      ),
      if (distance != null) ...[
        const SizedBox(width: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: const Color(0xFFE9EAED),
            borderRadius: BorderRadius.circular(24),
          ),
          child: Text(
            distance,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    ],
  );
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: _rideGrey,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Column(
      children: [
        _stop(originLabel, origin, pickupDistance, true),
        const SizedBox(height: 12),
        _stop('DESTINO', destination, tripDistance, false),
      ],
    ),
  );
}

Widget _rideMetrics(
  String timeLabel,
  String time,
  String distanceLabel,
  String distance,
  int passengers,
) => Row(
  crossAxisAlignment: CrossAxisAlignment.start,
  children: [
    Expanded(child: _rideMetric(Icons.schedule_rounded, timeLabel, time)),
    const SizedBox(width: 6),
    Expanded(child: _rideMetric(Icons.route_rounded, distanceLabel, distance)),
    const SizedBox(width: 6),
    Expanded(
      child: _rideMetric(Icons.group_rounded, 'Passageiros', '$passengers'),
    ),
  ],
);
Widget _rideMetric(IconData icon, String label, String value) => Container(
  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
  decoration: BoxDecoration(
    color: _rideGrey,
    borderRadius: BorderRadius.circular(16),
  ),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Icon(icon, color: _rideInk, size: 20),
      const SizedBox(height: 6),
      Text(label, style: const TextStyle(color: _rideMuted, fontSize: 11)),
      const SizedBox(height: 4),
      Text(
        value,
        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      ),
    ],
  ),
);

String _ridePayment(String? method) => switch (method) {
  'cash' => 'Dinheiro',
  'pix' => 'Pix',
  'card' || 'credit_card' || 'debit_card' => 'Cartão',
  _ => method ?? 'Não informado',
};
String _rideDistance(double? distance) => distance == null
    ? '—'
    : distance < 1
    ? '${(distance * 1000).round()} m'
    : '${distance.toStringAsFixed(1).replaceAll('.', ',')} km';

class _DriverOfferDesign extends StatelessWidget {
  const _DriverOfferDesign({
    required this.offer,
    required this.busy,
    required this.onAccept,
    required this.onReject,
    required this.onMinimize,
    this.pickupRoute,
    this.tripRoute,
  });
  final DriverOffer offer;
  final bool busy;
  final VoidCallback onAccept, onReject, onMinimize;
  final DriverRouteInfo? pickupRoute, tripRoute;
  @override
  Widget build(BuildContext context) {
    final seconds = offer.expiresAt
        .difference(DateTime.now())
        .inSeconds
        .clamp(0, 999);
    final pickup =
        pickupRoute?.distanceLabel ??
        _rideDistance(offer.approximatePickupDistanceKm);
    final trip =
        tripRoute?.distanceLabel ?? _rideDistance(offer.tripDistanceKm);
    return _DriverDesignFrame(
      floating: true,
      darkHeader: true,
      onMinimize: onMinimize,
      header: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: _rideYellow,
              borderRadius: BorderRadius.circular(24),
            ),
            child: const Row(
              children: [
                Icon(Icons.directions_car_filled, size: 20),
                SizedBox(width: 7),
                Text(
                  'NOVA CORRIDA',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                ),
              ],
            ),
          ),
          const Spacer(),
          SizedBox.square(
            dimension: 50,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CircularProgressIndicator(
                  value: (seconds / 35).clamp(0, 1),
                  color: _rideYellow,
                  backgroundColor: const Color(0xFF292D31),
                  strokeWidth: 4,
                ),
                SizedBox(
                  width: 40,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      '${seconds}s',
                      maxLines: 1,
                      softWrap: false,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'VOCÊ RECEBE',
                      style: TextStyle(
                        color: _rideMuted,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        formatCents(offer.driverEarningsCents),
                        maxLines: 1,
                        softWrap: false,
                        style: const TextStyle(
                          fontSize: 34,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 128),
                child: _rideCategory(offer.categoryLabel),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _RideRouteBlock(
            origin: offer.pickupInstructions ?? offer.origin.displayName,
            destination:
                offer.dropoffInstructions ?? offer.destination.displayName,
            pickupDistance: pickup,
            tripDistance: trip,
          ),
          const SizedBox(height: 8),
          _DriverTripMetrics(
            pickupDuration: pickupRoute?.durationLabel,
            pickupDistance: pickup,
            tripDuration: tripRoute?.durationLabel,
            tripDistance: trip,
            passengers: offer.passengers,
          ),
          if (offer.pickupCompensationCents > 0) ...[
            const SizedBox(height: 10),
            _DriverNoticeStrip(
              icon: Icons.add_road_rounded,
              text:
                  '+ ${formatCents(offer.pickupCompensationCents)} de coleta distante, integral para você',
            ),
          ],
          const SizedBox(height: 12),
          _DriverNoticeStrip(
            icon: Icons.payments_outlined,
            text: offer.isCash && offer.cashCollectionAmountCents != null
                ? 'Pagamento em dinheiro · cobrar ${formatCents(offer.cashCollectionAmountCents!)}'
                : 'Pagamento: ${_ridePayment(offer.paymentMethod)}',
          ),
        ],
      ),
      actions: _ridePair(
        _RideButton('Recusar', busy || seconds == 0 ? null : onReject),
        _RideButton(
          'Aceitar corrida',
          busy || seconds == 0 ? null : onAccept,
          primary: true,
        ),
      ),
    );
  }
}

class _DriverActiveDesign extends StatelessWidget {
  const _DriverActiveDesign({
    this.identity,
    required this.ride,
    required this.busy,
    required this.onMinimize,
    required this.onArrived,
    required this.onStart,
    required this.onComplete,
    required this.onCancel,
    required this.onChat,
    required this.canNavigate,
    required this.navigationActive,
    required this.onNavigate,
    required this.onStopNavigation,
    required this.onExternalNavigation,
    this.route,
    this.chatIcon,
    this.onRatePassenger,
  });
  final AcceptedDriverRide ride;
  final Widget? identity;
  final Widget? chatIcon;
  final VoidCallback? onRatePassenger;
  final bool busy, canNavigate, navigationActive;
  final DriverRouteInfo? route;
  final VoidCallback onMinimize,
      onArrived,
      onStart,
      onComplete,
      onCancel,
      onChat,
      onNavigate,
      onStopNavigation,
      onExternalNavigation;
  @override
  Widget build(BuildContext context) {
    final done = ride.state == 'COMPLETED';
    final underway = ride.state == 'IN_PROGRESS';
    final arrived = ride.state == 'DRIVER_ARRIVED';
    final waitingForPayment = ride.state == 'AWAITING_PAYMENT';
    final narrowScreen = MediaQuery.sizeOf(context).width < 360;
    final category = switch (ride.category) {
      'moto' => 'Moto',
      'car' => 'Carro',
      'buggy' => 'Buggy',
      'comfort_black' => 'Comfort / Black',
      'delivery' => 'Entrega',
      _ => ride.category,
    };
    return _DriverDesignFrame(
      onMinimize: onMinimize,
      header: _rideHeading(
        done
            ? 'Corrida finalizada'
            : waitingForPayment
            ? (narrowScreen ? 'Aguardando pagamento' : 'Aguardando pagamento do passageiro')
            : underway
            ? 'Corrida em andamento'
            : arrived
            ? 'Você chegou'
            : 'Indo buscar passageiro',
        done
            ? 'Viagem concluída com sucesso'
            : waitingForPayment
            ? 'Aguarde a confirmação para começar'
            : underway
            ? 'Passageiro a bordo'
            : arrived
            ? 'Pronto para iniciar o embarque'
            : 'Chegue no embarque',
        category,
        done: done,
        compact: narrowScreen,
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (identity != null) identity!,
          if (waitingForPayment) ...[
            const SizedBox(height: 8),
            _DriverNoticeStrip(
              icon: Icons.hourglass_top_rounded,
              text: ride.driverHoldExpiresAt == null
                  ? 'Reserva com prazo limitado. Aguarde a confirmação do pagamento.'
                  : 'Reserva: ${ride.driverHoldExpiresAt!.difference(DateTime.now()).inSeconds.clamp(0, 999)} segundos restantes. Aguarde a confirmação do pagamento.',
            ),
          ],
          if (done) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _rideGrey,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Valor da corrida',
                          style: TextStyle(color: _rideMuted),
                        ),
                        // The existing completion contract does not expose the total fare.
                        Text(
                          '—',
                          style: TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Flexible(child: _rideCategory(category)),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],
          _RideRouteBlock(
            origin: ride.pickupInstructions ?? ride.origin.displayName,
            destination:
                ride.dropoffInstructions ?? ride.destination.displayName,
            originLabel: done
                ? 'Origem'
                : underway
                ? 'ORIGEM'
                : 'EMBARQUE',
            pickupDistance: !done && !underway && !waitingForPayment
                ? route?.distanceLabel
                : null,
            tripDistance: underway ? route?.distanceLabel : null,
          ),
          const SizedBox(height: 8),
          _rideMetrics(
            done || underway ? 'Tempo de viagem' : 'Tempo até chegar',
            // Remaining route duration is an ETA, never elapsed trip time.
            done || underway ? '—' : route?.durationLabel ?? '—',
            underway ? 'Distância restante' : 'Distância',
            done ? '—' : route?.distanceLabel ?? '—',
            ride.passengers,
          ),
          if (done) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _rideGrey,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  const Icon(Icons.payments_outlined, color: _rideInk),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Pagamento',
                          style: TextStyle(color: _rideMuted),
                        ),
                        Text(
                          _ridePayment(ride.paymentMethod),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      const Text(
                        'Valor recebido',
                        style: TextStyle(color: _rideMuted, fontSize: 12),
                      ),
                      Text(
                        formatCents(ride.driverEarningsCents),
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 17,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ] else ...[
            // Preserve financial information and existing navigation controls.
            const SizedBox(height: 8),
            _DriverNoticeStrip(
              icon: Icons.payments_outlined,
              text: ride.isCash && ride.cashCollectionAmountCents != null
                  ? 'Receber em dinheiro: ${formatCents(ride.cashCollectionAmountCents!)}'
                  : 'SEU GANHO · ${formatCents(ride.driverEarningsCents)}',
            ),
            if (canNavigate && !waitingForPayment)
              TextButton.icon(
                onPressed: navigationActive ? onStopNavigation : onNavigate,
                icon: Icon(
                  navigationActive
                      ? Icons.close_rounded
                      : Icons.navigation_rounded,
                ),
                label: Text(
                  navigationActive
                      ? 'Parar navegação'
                      : underway
                      ? 'Navegar até o destino'
                      : 'Navegar até o embarque',
                ),
              ),
          ],
        ],
      ),
      actions: done
          ? _ridePair(
              _RideButton(
                'Avaliar passageiro',
                busy ? null : onRatePassenger,
                icon: Icons.star_outline_rounded,
              ),
              _RideButton(
                narrowScreen ? 'Voltar ao mapa' : 'Concluir e voltar para o mapa',
                onComplete,
                primary: true,
                icon: Icons.check_circle,
              ),
            )
          : waitingForPayment
          ? _RideButton(
              'Cancelar corrida',
              busy ? null : onCancel,
              icon: Icons.cancel_outlined,
            )
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (canNavigate)
                  _ridePair(
                    _RideButton(
                      narrowScreen ? 'Mensagem' : 'Mensagem com passageiro',
                      onChat,
                      leading: chatIcon,
                      compact: true,
                      icon: Icons.chat_outlined,
                    ),
                    _RideButton(
                      narrowScreen ? 'Google Maps' : 'Abrir no Google Maps',
                      onExternalNavigation,
                      compact: true,
                      icon: Icons.chevron_right,
                    ),
                  )
                else
                  _RideButton(
                    narrowScreen ? 'Mensagem' : 'Mensagem com passageiro',
                    onChat,
                    leading: chatIcon,
                    icon: Icons.chat_outlined,
                  ),
                const SizedBox(height: 8),
                if (underway)
                  _RideButton(
                    'Finalizar corrida',
                    busy ? null : onComplete,
                    primary: true,
                    icon: Icons.flag_rounded,
                  )
                else
                  _ridePair(
                    _RideButton(
                      'Cancelar corrida',
                      busy ? null : onCancel,
                      icon: Icons.cancel_outlined,
                    ),
                    _RideButton(
                      arrived ? 'Iniciar corrida' : 'Cheguei no embarque',
                      busy ? null : (arrived ? onStart : onArrived),
                      primary: true,
                      icon: Icons.flag_rounded,
                    ),
                  ),
              ],
            ),
    );
  }
}
