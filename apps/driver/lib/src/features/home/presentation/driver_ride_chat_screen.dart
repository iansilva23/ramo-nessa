import 'dart:async';

import 'package:url_launcher/url_launcher.dart';

import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../data/driver_api.dart';
import '../domain/driver_models.dart';

class DriverRideChatScreen extends StatefulWidget {
  const DriverRideChatScreen({
    super.key,
    required this.api,
    required this.rideId,
  });

  final DriverApi api;
  final String rideId;

  @override
  State<DriverRideChatScreen> createState() => _DriverRideChatScreenState();
}

class _DriverRideChatScreenState extends State<DriverRideChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _timer;
  List<DriverRideChatMessage> _messages = const [];
  late final RamoChatReadController _readController;
  bool _refreshing = false;
  bool _loadingEarlier = false;
  bool _hasEarlier = false;
  bool _loading = true;
  String? _passengerWhatsApp;
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _readController = RamoChatReadController(
      api: widget.api,
      rideId: widget.rideId,
      context: () => context,
      scrollController: _scrollController,
    );
    _refresh(scrollToEnd: true);
    _timer = Timer.periodic(const Duration(seconds: 4), (_) => _refresh());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _readController.dispose();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _refresh({bool scrollToEnd = false}) async {
    if (_refreshing) return;
    _refreshing = true;
    try {
      final messages = await widget.api.rideMessages(widget.rideId);
      if (!mounted) return;
      final changed = messages.any(
        (message) => !_messages.any((old) => old.id == message.id),
      );
      setState(() {
        final merged = {
          for (final message in _messages) message.id: message,
          for (final message in messages) message.id: message,
        };
        if (_loading) _hasEarlier = messages.length == 100;
        _messages = merged.values.toList()
          ..sort(
            (a, b) => a.createdAt.compareTo(b.createdAt) != 0
                ? a.createdAt.compareTo(b.createdAt)
                : a.id.compareTo(b.id),
          );
        _loading = false;
        _error = null;
      });
      if (scrollToEnd || changed) _scrollToEnd();
      _readController.checkVisible();
      final service = widget.api;
      if (service is RamoRideChatApi) {
        final status = await (service as RamoRideChatApi).rideChatStatus(
          widget.rideId,
        );
        if (mounted) {
          setState(() => _passengerWhatsApp = status.passengerWhatsApp);
        }
      }
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _passengerWhatsApp = null;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _passengerWhatsApp = null;
        _error = 'Não conseguimos atualizar o chat agora.';
      });
    } finally {
      _refreshing = false;
    }
  }

  Future<void> _openWhatsApp() async {
    final phone = _passengerWhatsApp;
    if (phone == null) return;
    final uri = Uri.https('wa.me', '/${phone.replaceAll(RegExp(r'\D'), '')}');
    try {
      final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!opened) throw StateError('WhatsApp unavailable');
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Não foi possível abrir o WhatsApp. Use o número exibido acima.',
        );
      }
    }
  }

  Future<void> _loadEarlier() async {
    final service = widget.api;
    if (_loadingEarlier || _messages.isEmpty || service is! RamoRideChatApi) {
      return;
    }
    setState(() => _loadingEarlier = true);
    try {
      final rows = await (service as RamoRideChatApi).rideChatPage(
        widget.rideId,
        before: _messages.first.id,
      );
      if (!mounted) return;
      final older = rows.map(DriverRideChatMessage.fromJson).toList();
      final oldOffset = _scrollController.hasClients
          ? _scrollController.offset
          : 0.0;
      final oldExtent = _scrollController.hasClients
          ? _scrollController.position.maxScrollExtent
          : 0.0;
      setState(() {
        final merged = {
          for (final m in older) m.id: m,
          for (final m in _messages) m.id: m,
        };
        _messages = merged.values.toList();
        _hasEarlier = older.length == 100;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_scrollController.hasClients) return;
        final target =
            oldOffset + _scrollController.position.maxScrollExtent - oldExtent;
        _scrollController.jumpTo(
          target.clamp(0.0, _scrollController.position.maxScrollExtent),
        );
        _readController.checkVisible();
      });
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Não foi possível carregar mensagens anteriores.',
        );
      }
    } finally {
      if (mounted) setState(() => _loadingEarlier = false);
    }
  }

  Future<void> _send() async {
    final body = _controller.text.trim();
    if (body.isEmpty || _sending) return;

    setState(() {
      _sending = true;
      _error = null;
    });

    try {
      await widget.api.sendRideMessage(rideId: widget.rideId, body: body);
      _controller.clear();
      await _refresh(scrollToEnd: true);
      if (!mounted) return;
      setState(() => _sending = false);
    } on DriverApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = 'Não conseguimos enviar a mensagem agora.';
      });
    }
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) return;
      _scrollController
          .animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
          )
          .then((_) => _readController.checkVisible());
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mensagem com passageiro')),
      body: Column(
        children: [
          if (_passengerWhatsApp != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Wrap(
                spacing: 16,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                alignment: WrapAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('WhatsApp do passageiro'),
                      SelectableText(_passengerWhatsApp!),
                    ],
                  ),
                  TextButton.icon(
                    onPressed: _openWhatsApp,
                    icon: const Icon(Icons.phone_outlined),
                    label: const Text('Chamar no WhatsApp'),
                  ),
                ],
              ),
            ),
          if (_hasEarlier)
            TextButton(
              onPressed: _loadingEarlier ? null : _loadEarlier,
              child: Text(
                _loadingEarlier ? 'Carregando…' : 'Ver mensagens anteriores',
              ),
            ),
          Expanded(
            child: _loading && _messages.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.all(RamoSpacing.xl),
                      child: Text(
                        'Nenhuma mensagem ainda. Use o chat para '
                        'combinar o ponto de encontro ou pedir uma '
                        'informação rápida ao passageiro.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : ListView.builder(
                    key: _readController.viewportKey,
                    controller: _scrollController,
                    padding: const EdgeInsets.all(RamoSpacing.md),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final message = _messages[index];
                      final mine = message.fromDriver;
                      return Align(
                        key: mine
                            ? null
                            : _readController.messageKey(message.id),
                        alignment: mine
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          constraints: const BoxConstraints(maxWidth: 300),
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: mine
                                ? RamoColors.brandBlack
                                : Theme.of(context)
                                      .colorScheme
                                      .surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Text(
                            message.body,
                            style: TextStyle(
                              color: mine ? Colors.white : null,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                RamoSpacing.md,
                0,
                RamoSpacing.md,
                RamoSpacing.xs,
              ),
              child: Text(
                _error!,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.error,
                  fontSize: 12,
                ),
              ),
            ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                RamoSpacing.md,
                RamoSpacing.xs,
                RamoSpacing.md,
                RamoSpacing.md,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      enabled: !_sending,
                      minLines: 1,
                      maxLines: 4,
                      maxLength: 1000,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        hintText: 'Mensagem para o passageiro',
                        counterText: '',
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    tooltip: 'Enviar',
                    onPressed: _sending ? null : _send,
                    icon: _sending
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send_rounded),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
