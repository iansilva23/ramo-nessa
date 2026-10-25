import 'dart:async';
import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import '../data/passenger_activity_service.dart';
import '../domain/passenger_activity.dart';

class PassengerActivityScreen extends StatefulWidget {
  const PassengerActivityScreen({
    super.key,
    required this.service,
    this.onResume,
    this.support,
    this.visible = true,
  });
  final PassengerActivityService? service;
  final Future<void> Function(PassengerActivityRide ride)? onResume;
  final RamoRideSupportApi? support;
  final bool visible;
  @override
  State<PassengerActivityScreen> createState() =>
      _PassengerActivityScreenState();
}

class _PassengerActivityScreenState extends State<PassengerActivityScreen>
    with WidgetsBindingObserver {
  PassengerActivitySnapshot? _activity;
  bool _loading = false, _history = false;
  String? _error, _opening;
  Timer? _timer;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
    _timer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (widget.visible) unawaited(_load());
    });
  }

  @override
  void didUpdateWidget(PassengerActivityScreen old) {
    super.didUpdateWidget(old);
    if (widget.visible && !old.visible) unawaited(_load());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && widget.visible) {
      unawaited(_load());
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _load() async {
    if (_loading) return;
    if (widget.service == null) {
      setState(
        () => _error = 'Suas atividades estão indisponíveis neste modo.',
      );
      return;
    }
    setState(() => _loading = true);
    try {
      final activity = await widget.service!.fetch();
      if (mounted) {
        setState(() {
          _activity = activity;
          _loading = false;
          _error = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error =
              'Não conseguimos atualizar. Os últimos registros continuam visíveis.';
        });
      }
    }
  }

  Future<void> _help(PassengerActivityRide ride) async {
    final api = widget.support;
    if (api == null) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) =>
            RamoRideSupportScreen(api: api, ride: ride.activityData),
      ),
    );
    if (mounted) unawaited(_load());
  }

  Future<void> _open(PassengerActivityRide ride) async {
    if (_opening != null) return;
    if (ride.activityData.terminal) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => RamoRideDetailsScreen(
            ride: ride.activityData,
            onHelp: widget.support == null ? null : () => _help(ride),
          ),
        ),
      );
      return;
    }
    if (widget.onResume == null) return;
    setState(() => _opening = ride.id);
    try {
      await widget.onResume!(ride);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Não conseguimos abrir a corrida. Tente novamente; nenhum pagamento foi criado.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _opening = null);
        unawaited(_load());
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final all = _activity?.rides ?? const <PassengerActivityRide>[];
    final active = all.where((r) => !r.activityData.terminal).toList();
    final rides = _history
        ? all.where((r) => r.activityData.terminal).toList()
        : active;
    final colors = Theme.of(context).colorScheme;
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(22, 24, 22, 30),
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Atividades',
                        style: Theme.of(context).textTheme.headlineMedium
                            ?.copyWith(
                              fontWeight: FontWeight.w600,
                              letterSpacing: -1,
                            ),
                      ),
                      Text(
                        'Suas corridas, sempre por aqui.',
                        style: TextStyle(
                          color: colors.onSurfaceVariant,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: RamoColors.brandYellow,
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: const Text(
                    'rn.',
                    style: TextStyle(
                      color: Colors.black,
                      fontSize: 21,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 22),
            Row(
              children: [
                Expanded(
                  flex: 3,
                  child: _tab('Em andamento · ${active.length}', false),
                ),
                const SizedBox(width: 16),
                Expanded(flex: 2, child: _tab('Histórico', true)),
              ],
            ),
            const Divider(height: 1),
            const SizedBox(height: 22),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(
                  children: [
                    const Icon(Icons.cloud_off_outlined, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _error!,
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                    IconButton(
                      onPressed: _load,
                      icon: const Icon(Icons.refresh),
                      tooltip: 'Tentar novamente',
                    ),
                  ],
                ),
              ),
            if (_loading && _activity == null)
              const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (rides.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 36),
                child: Column(
                  children: [
                    Icon(
                      _history ? Icons.history : Icons.route_outlined,
                      size: 38,
                      color: colors.onSurfaceVariant,
                    ),
                    const SizedBox(height: 14),
                    Text(
                      _history
                          ? 'Nenhuma corrida no histórico'
                          : 'Nenhuma corrida em andamento',
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _history
                          ? 'Suas viagens concluídas aparecerão aqui.'
                          : 'Quando você pedir uma corrida, acompanhe por aqui.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        color: colors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              )
            else
              ...rides.map(
                (ride) => Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: RamoRideActivityCard(
                    ride: ride.activityData,
                    busy: _opening == ride.id,
                    onOpen:
                        widget.onResume == null && !ride.activityData.terminal
                        ? null
                        : () => _open(ride),
                    onHelp: widget.support == null ? null : () => _help(ride),
                  ),
                ),
              ),
            if (!_history && active.isNotEmpty)
              Text(
                'Fechou e voltou? Sua corrida continua aqui para acompanhar ou pedir ajuda.',
                style: TextStyle(fontSize: 12, color: colors.onSurfaceVariant),
              ),
          ],
        ),
      ),
    );
  }

  Widget _tab(String label, bool history) => TextButton(
    onPressed: () => setState(() => _history = history),
    style: TextButton.styleFrom(
      foregroundColor: Theme.of(context).colorScheme.onSurface,
      textStyle: const TextStyle(fontSize: 13),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      minimumSize: const Size(0, 48),
      shape: const RoundedRectangleBorder(),
      side: BorderSide(
        color: _history == history
            ? Theme.of(context).colorScheme.onSurface
            : Colors.transparent,
        width: 2,
      ),
    ),
    child: Text(label),
  );
}
