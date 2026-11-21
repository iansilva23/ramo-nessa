part of '../driver_home_screen.dart';

const _rideInk = Color(0xFF080A0B);
const _rideMuted = Color(0xFF70747D);
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
    final trip = tripRoute?.distanceLabel ??
        (offer.tripDistanceKm == null ? null : _rideDistance(offer.tripDistanceKm));
    final pickupInfo = [pickupRoute?.durationLabel, pickup].whereType<String>().join(' · ');
    final tripInfo = [tripRoute?.durationLabel, trip].whereType<String>().join(' · ');
    final fare = offer.cashCollectionAmountCents;
    final tendered = offer.cashTenderedCents;
    final change = offer.isCash && fare != null && tendered != null && tendered > fare
        ? tendered - fare : null;
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
          if (offer.campaignPresentation != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: DriverCampaignNotice(presentation: offer.campaignPresentation!, compact: true)),
          Text('Seu ganho', style: const TextStyle(color: _rideMuted, fontSize: 12)),
          Row(children: [
            Expanded(child: Text(
              formatCents(offer.driverEarningsCents),
              style: const TextStyle(fontSize: 27, fontWeight: FontWeight.w900),
            )),
            Flexible(child: _rideCategory(offer.categoryLabel)),
          ]),
          const SizedBox(height: 7),
          _OfferStop(Icons.radio_button_checked_rounded, offer.originDisplayName, pickupInfo),
          _OfferStop(Icons.place_outlined, offer.destinationDisplayName, tripInfo),
          if(offer.occurrenceBonusCents>0)_DriverNoticeStrip(icon:Icons.add_rounded,text:'Bônus de ocorrência + ${formatCents(offer.occurrenceBonusCents)}'),
          if (offer.pickupCompensationCents > 0) ...[
            const SizedBox(height: 10),
            _DriverNoticeStrip(
              icon: Icons.add_road_rounded,
              text:
                  '+ ${formatCents(offer.pickupCompensationCents)} de coleta distante, integral para você',
            ),
          ],
          if (change != null || offer.paymentMethod != null) ...[
            const SizedBox(height: 6),
            _DriverNoticeStrip(
              icon: Icons.payments_outlined,
              text: change != null ? 'Levar ${formatCents(change)} de troco' :
                _ridePayment(offer.paymentMethod),
            ),
          ],
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

class _OfferStop extends StatelessWidget {
  const _OfferStop(this.icon, this.place, this.metrics);

  final IconData icon;
  final String place, metrics;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(children: [
      Icon(icon, size: 16, color: _rideInk),
      const SizedBox(width: 8),
      Expanded(child: Text(place, maxLines: 2, overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800))),
      if (metrics.isNotEmpty) ...[
        const SizedBox(width: 8),
        Text(metrics, style: const TextStyle(fontSize: 11, color: _rideMuted)),
      ],
    ]),
  );
}

class _DriverActiveDesign extends StatefulWidget {
  const _DriverActiveDesign({
    this.identity,
    this.route,
    this.chatIcon,
    this.onRatePassenger,
    this.celebrateUntil,
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
  });

  final AcceptedDriverRide ride;
  final Widget? identity, chatIcon;
  final DriverRouteInfo? route;
  final DateTime? celebrateUntil;
  final bool busy, canNavigate, navigationActive;
  final VoidCallback onMinimize, onArrived, onStart, onComplete, onCancel, onChat,
      onNavigate, onStopNavigation, onExternalNavigation;
  final VoidCallback? onRatePassenger;

  @override
  State<_DriverActiveDesign> createState() => _DriverActiveDesignState();
}

class _DriverActiveDesignState extends State<_DriverActiveDesign> {
  bool _expanded = false;
  double _drag = 0;

  void _expand(bool expanded) => setState(() => _expanded = expanded);

  @override
  Widget build(BuildContext context) {
    final ride = widget.ride;
    final arrived = ride.state == 'DRIVER_ARRIVED';
    final underway = ride.state == 'IN_PROGRESS';
    final done = ride.state == 'COMPLETED';
    final heading = done ? 'Corrida finalizada' : underway ? 'Em andamento' :
        arrived ? 'Você chegou' : 'Indo buscar';
    final action = done ? 'Voltar ao mapa' : underway ? 'Finalizar corrida' :
        arrived ? 'Iniciar corrida' : 'Cheguei';
    final onAction = done || underway ? widget.onComplete :
        arrived ? widget.onStart : widget.onArrived;
    final address = underway ? ride.destinationDisplayName : ride.originDisplayName;
    final route = widget.route;
    final metrics = [route?.durationLabel, route?.distanceLabel].whereType<String>().join(' · ');
    final cashAmount = ride.cashCollectionAmountCents;
    final cashTendered = ride.cashTenderedCents;
    final change = cashAmount != null && cashTendered != null && cashTendered > cashAmount
        ? cashTendered - cashAmount : null;

    const headingStyle = TextStyle(fontSize: 13, fontWeight: FontWeight.w800);
    const addressStyle = TextStyle(fontSize: 17, fontWeight: FontWeight.w900, height: 1.15);
    const metaStyle = TextStyle(color: _rideMuted, fontSize: 12, height: 1.16);

    final details = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Divider(height: 18),
        if (arrived || underway || done)
          _DockedDetail('Embarque', ride.originDisplayName),
        if (!underway)
          _DockedDetail('Destino', ride.destinationDisplayName),
        _DockedDetail('Passageiros', '${ride.passengers}'),
        if (!done && !arrived)
          _DockedDetail('Pagamento', _ridePayment(ride.paymentMethod)),
        if (!done)
          _DockedDetail('Seu ganho', formatCents(ride.driverEarningsCents)),
        if (ride.campaignPresentation != null)
          DriverCampaignNotice(presentation: ride.campaignPresentation!,
            celebrateUntil: widget.celebrateUntil),
        if (ride.occurrenceBonusCents > 0)
          _DockedDetail('Bônus de ocorrência', formatCents(ride.occurrenceBonusCents)),
        if (widget.canNavigate)
          TextButton.icon(
            onPressed: widget.onExternalNavigation,
            icon: const Icon(Icons.open_in_new_rounded, size: 17),
            label: const Text('Abrir no Google Maps'),
          ),
        if (!done && !underway)
          TextButton(onPressed: widget.busy ? null : widget.onCancel,
            child: const Text('Cancelar corrida')),
      ],
    );

    return RamoWebMapOverlay(
      child: LayoutBuilder(builder: (context, constraints) {
        final short = constraints.maxHeight < 220;
        return Material(
          key: const ValueKey('ride-docked-panel'),
          color: Colors.white,
          elevation: 8,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          clipBehavior: Clip.antiAlias,
          child: Center(
            heightFactor: 1,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 540),
              child: Padding(
                padding: EdgeInsets.fromLTRB(16, 0, 16, short ? 6 : 10),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Semantics(
                      button: true,
                      label: _expanded ? 'Recolher detalhes' : 'Expandir detalhes',
                      child: GestureDetector(
                        key: const ValueKey('ride-drag-handle'),
                        behavior: HitTestBehavior.opaque,
                        onTap: () => _expand(!_expanded),
                        onVerticalDragStart: (_) => _drag = 0,
                        onVerticalDragUpdate: (details) => _drag += details.delta.dy,
                        onVerticalDragEnd: (_) {
                          if (_drag.abs() > 15) _expand(_drag < 0);
                        },
                        child: SizedBox(
                          height: short ? 16 : 20,
                          child: Center(
                            child: Container(width: 34, height: 4,
                              decoration: BoxDecoration(color: const Color(0xFFB9BBC1),
                                borderRadius: BorderRadius.circular(4))),
                          ),
                        ),
                      ),
                    ),
                    Row(
                      children: [
                        if (done) ...[
                          const Icon(Icons.check_circle_rounded, color: RamoColors.success, size: 18),
                          const SizedBox(width: 6),
                        ],
                        Expanded(child: Text(heading, style: headingStyle)),
                        if (!done)
                          IconButton(
                            tooltip: 'Mensagem com passageiro',
                            icon: widget.chatIcon ?? const Icon(Icons.chat_bubble_outline_rounded, size: 19),
                            visualDensity: VisualDensity.compact,
                            onPressed: widget.onChat,
                          ),
                        if (widget.canNavigate)
                          IconButton(
                            tooltip: widget.navigationActive ? 'Parar navegação' : 'Navegar',
                            icon: Icon(widget.navigationActive ? Icons.navigation_rounded :
                                Icons.navigation_outlined, size: 19),
                            visualDensity: VisualDensity.compact,
                            onPressed: widget.navigationActive ? widget.onStopNavigation : widget.onNavigate,
                          ),
                        IconButton(
                          tooltip: 'Minimizar informações',
                          icon: const Icon(Icons.keyboard_arrow_down_rounded),
                          visualDensity: VisualDensity.compact,
                          onPressed: widget.onMinimize,
                        ),
                      ],
                    ),
                    Flexible(
                      child: SingleChildScrollView(
                        key: const ValueKey('ride-secondary-scroll'),
                        physics: _expanded ? null : const NeverScrollableScrollPhysics(),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (done) ...[
                              Text('Seu ganho', style: metaStyle),
                              Text(formatCents(ride.driverEarningsCents), style: addressStyle),
                              if (ride.paymentMethod != null)
                                Text(_ridePayment(ride.paymentMethod), style: metaStyle),
                              if (widget.onRatePassenger != null)
                                Align(alignment: Alignment.centerLeft, child: TextButton(
                                  onPressed: widget.busy ? null : widget.onRatePassenger,
                                  child: const Text('Avaliar passageiro'))),
                            ] else if (arrived) ...[
                              if (widget.identity != null) widget.identity!,
                              if (ride.isCash && cashAmount != null) ...[
                                _DockedDetail('Receber', formatCents(cashAmount)),
                                if (change != null) _DockedDetail('Troco', formatCents(change)),
                              ] else if (ride.paymentMethod == 'pix' && ride.paymentStatus == 'paid')
                                const Text('Pix confirmado', style: metaStyle),
                            ] else ...[
                              Text(address, maxLines: _expanded ? null : 1,
                                overflow: _expanded ? null : TextOverflow.ellipsis,
                                style: addressStyle),
                              if (metrics.isNotEmpty)
                                Text(metrics, maxLines: 1, overflow: TextOverflow.ellipsis,
                                  style: metaStyle),
                              if (!underway && !short && widget.identity != null)
                                widget.identity!,
                            ],
                            if (_expanded) details,
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 7),
                    _RideButton(action, widget.busy ? null : onAction, primary: true),
                  ],
                ),
              ),
            ),
          ),
        );
      }),
    );
  }
}

class _DockedDetail extends StatelessWidget {
  const _DockedDetail(this.label, this.value);
  final String label, value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(children: [
      Expanded(child: Text(label, style: const TextStyle(color: _rideMuted, fontSize: 12))),
      Flexible(child: Text(value, textAlign: TextAlign.end,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800))),
    ]),
  );
}
