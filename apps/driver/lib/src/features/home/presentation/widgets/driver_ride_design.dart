part of '../driver_home_screen.dart';

const _rideInk = Color(0xFF080A0B);
const _rideMuted = Color(0xFF70747D);
const _rideGrey = Color(0xFFF4F4F6);
const _rideYellow = Color(0xFFFFD600);

// Bounds come from the map's usable overlay area, above the existing tab bar.
// Only secondary content scrolls; the handle and primary actions stay mounted.
class _DriverDesignFrame extends StatelessWidget {
  const _DriverDesignFrame({
    required this.header,
    required this.body,
    required this.actions,
    required this.onMinimize,
    this.darkHeader = false,
    this.secondaryActions,
  });
  final Widget header, body, actions;
  final Widget? secondaryActions;
  final VoidCallback onMinimize;
  final bool darkHeader;

  @override
  Widget build(BuildContext context) => RamoWebMapOverlay(
    child: LayoutBuilder(
      builder: (context, constraints) {
        // On short viewports the title can scroll with the details. The gesture
        // handle and actions always remain outside that scrollable area.
        final scrollHeader = constraints.maxHeight < 360;
        final scrollSecondaryActions = constraints.maxHeight < 260;
        final heading = Container(
          color: darkHeader ? _rideInk : Colors.white,
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
          child: header,
        );
        final details = Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: darkHeader
                ? const BorderRadius.vertical(top: Radius.circular(24))
                : null,
          ),
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
          child: body,
        );
        return ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: 480,
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
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x22000000),
                      blurRadius: 20,
                      offset: Offset(0, 6),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(28),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Semantics(
                        label: 'Minimizar informações',
                        button: true,
                        onTap: onMinimize,
                        child: GestureDetector(
                          key: const ValueKey('ride-drag-handle'),
                          behavior: HitTestBehavior.opaque,
                          onVerticalDragEnd: (details) {
                            if ((details.primaryVelocity ?? 0) > 120) {
                              onMinimize();
                            }
                          },
                          onVerticalDragUpdate: (details) {
                            if (details.localPosition.dy > 38 &&
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
                            children: [
                              if (scrollHeader) heading,
                              details,
                              if (scrollSecondaryActions && secondaryActions != null)
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
                                  child: secondaryActions,
                                ),
                            ],
                          ),
                        ),
                      ),
                      Container(
                        color: Colors.white,
                        padding: const EdgeInsets.fromLTRB(14, 2, 14, 14),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (!scrollSecondaryActions && secondaryActions != null) ...[
                              secondaryActions!,
                              const SizedBox(height: 8),
                            ],
                            actions,
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    ),
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
      Flexible(child: _rideCategory(category)),
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
      darkHeader: false,
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
                  backgroundColor: const Color(0xFFE8E8EC),
                  strokeWidth: 4,
                ),
                Text(
                  '${seconds}s',
                  style: const TextStyle(
                    color: _rideInk,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
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
                    Text(
                      formatCents(offer.driverEarningsCents),
                      style: const TextStyle(
                        fontSize: 34,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              Flexible(child: _rideCategory(offer.categoryLabel)),
            ],
          ),
          const SizedBox(height: 12),
          _RideRouteBlock(
            origin: offer.originDisplayName,
            destination:
                offer.destinationDisplayName,
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
          if(offer.occurrenceBonusCents>0)_DriverNoticeStrip(icon:Icons.add_rounded,text:'Bônus de ocorrência + ${formatCents(offer.occurrenceBonusCents)}'),
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
            : underway
            ? 'Corrida em andamento'
            : 'Indo buscar passageiro',
        done
            ? 'Viagem concluída com sucesso'
            : underway
            ? 'Passageiro a bordo'
            : 'Chegue no embarque',
        category,
        done: done,
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if(identity!=null)identity!,
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
            origin: ride.originDisplayName,
            destination:
                ride.destinationDisplayName,
            originLabel: done
                ? 'Origem'
                : underway
                ? 'ORIGEM'
                : 'EMBARQUE',
            pickupDistance: !done && !underway ? route?.distanceLabel : null,
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
            if(ride.occurrenceBonusCents>0)_DriverNoticeStrip(icon:Icons.add_rounded,text:'Bônus de ocorrência + ${formatCents(ride.occurrenceBonusCents)}'),
            // Preserve financial information and existing navigation controls.
            const SizedBox(height: 8),
            _DriverNoticeStrip(
              icon: Icons.payments_outlined,
              text: ride.isCash && ride.cashCollectionAmountCents != null
                  ? 'Receber em dinheiro: ${formatCents(ride.cashCollectionAmountCents!)}'
                  : 'SEU GANHO · ${formatCents(ride.driverEarningsCents)}',
            ),
            if (canNavigate)
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
                'Concluir e voltar para o mapa',
                onComplete,
                primary: true,
                icon: Icons.check_circle,
              ),
            )
          : _ridePair(
                  _RideButton(
                    underway ? 'Finalizar corrida' : 'Cancelar corrida',
                    busy
                        ? null
                        : underway
                        ? onComplete
                        : onCancel,
                    icon: Icons.cancel_outlined,
                  ),
                  _RideButton(
                    underway ? 'Cheguei no destino' : 'Cheguei no embarque',
                    busy
                        ? null
                        : underway
                        ? onComplete
                        : onArrived,
                    primary: true,
                    icon: Icons.flag_rounded,
                  ),
                ),
      secondaryActions: done ? null : _ridePair(
                  _RideButton(
                    'Mensagem com passageiro',
                    onChat,
                    leading: chatIcon,
                    compact: true,
                    icon: Icons.chat_outlined,
                  ),
                  _RideButton(
                    'Abrir no Google Maps',
                    canNavigate ? onExternalNavigation : null,
                    compact: true,
                    icon: Icons.chevron_right,
                  ),
                ),
    );
  }
}
