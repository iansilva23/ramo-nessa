import 'package:flutter/material.dart';
import '../data/preparation_operation_journal.dart';
import '../data/preparation_recovery_coordinator.dart';

/// Account verification and local persistence are initialized once per signed-in
/// session. The app's existing auth gate owns logout and token invalidation.
class PreparationSessionGate extends StatefulWidget {
  const PreparationSessionGate({super.key, required this.loadJournal, required this.builder});
  final Future<PreparationOperationJournal> Function() loadJournal;
  final Widget Function(PreparationOperationJournal journal) builder;
  @override
  State<PreparationSessionGate> createState() => _PreparationSessionGateState();
}

class _PreparationSessionGateState extends State<PreparationSessionGate> {
  late Future<PreparationOperationJournal> _loading = widget.loadJournal();
  @override
  Widget build(BuildContext context) => FutureBuilder<PreparationOperationJournal>(
    future: _loading,
    builder: (context, snapshot) {
      if (snapshot.hasData) return widget.builder(snapshot.data!);
      return Scaffold(body: SafeArea(child: Center(child: snapshot.hasError
        ? Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('Não conseguimos recuperar sua sessão agora.'),
            const SizedBox(height: 12),
            FilledButton(onPressed: () => setState(() { _loading = widget.loadJournal(); }),
              child: const Text('Tentar novamente')),
          ])
        : const CircularProgressIndicator())));
    },
  );
}

class PreparationRecoveryGate extends StatefulWidget {
  const PreparationRecoveryGate({super.key, required this.coordinator,
    required this.child, required this.buildRecovered});
  final PreparationRecoveryCoordinator coordinator;
  final Widget child;
  final Widget Function(Map<String, dynamic> data, VoidCallback close) buildRecovered;
  @override
  State<PreparationRecoveryGate> createState() => _PreparationRecoveryGateState();
}

class _PreparationRecoveryGateState extends State<PreparationRecoveryGate> {
  bool _loading = true;
  bool _pendingRetry = false;
  Map<String, dynamic>? _ride;
  @override
  void initState() { super.initState(); _recover(); }

  Future<void> _recover() async {
    try {
      final result = await widget.coordinator.recover();
      if (!mounted) return;
      setState(() { _loading = false; _ride = result.ride; _pendingRetry = result.pendingRetry; });
    } catch (_) {
      if (!mounted) return;
      setState(() { _loading = false; _pendingRetry = true; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final ride = _ride;
    if (ride != null) return widget.buildRecovered(ride, () => setState(() { _ride = null; }));
    return Column(children: [
      if (_pendingRetry) MaterialBanner(
        content: const Text('Não conseguimos conferir sua corrida anterior.'),
        actions: [TextButton(onPressed: () {
          setState(() { _loading = true; });
          _recover();
        }, child: const Text('Reconectar'))],
      ),
      Expanded(child: widget.child),
    ]);
  }
}
