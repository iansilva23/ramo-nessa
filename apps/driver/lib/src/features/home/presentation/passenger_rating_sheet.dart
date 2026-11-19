import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../data/driver_api.dart';
import '../data/passenger_rating_api.dart';

Future<bool?> showPassengerRatingSheet(
  BuildContext context, {
  required DriverPassengerRatingApi api,
  required String rideId,
}) => showModalBottomSheet<bool>(
  context: context,
  isScrollControlled: true,
  isDismissible: false,
  enableDrag: false,
  backgroundColor: Colors.transparent,
  barrierColor: Colors.black.withValues(alpha: .12),
  constraints: const BoxConstraints(maxWidth: 560),
  builder: (_) => PassengerRatingSheet(api: api, rideId: rideId),
);

class PassengerRatingSheet extends StatefulWidget {
  const PassengerRatingSheet({
    super.key,
    required this.api,
    required this.rideId,
  });
  final DriverPassengerRatingApi api;
  final String rideId;
  @override
  State<PassengerRatingSheet> createState() => _PassengerRatingSheetState();
}

class _PassengerRatingSheetState extends State<PassengerRatingSheet> {
  static const _yellow = Color(0xFFFFD600);
  static const _ink = Color(0xFF101010);
  static const _muted = Color(0xFF777F8E);
  static const _reasons = {
    'polite': 'Educado',
    'punctual': 'Pontual',
    'respectful': 'Respeitoso',
    'communication': 'Boa comunicação',
    'other': 'Outro motivo',
  };
  final _comment = TextEditingController();
  final _selected = <String>{};
  int _stars = 0;
  bool _loading = true;
  bool _saving = false;
  bool _stored = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rating = await widget.api.passengerRating(widget.rideId);
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (rating != null) {
          _apply(rating);
          _stored = true;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Não conseguimos consultar a avaliação. Tente novamente.';
      });
    }
  }

  void _apply(DriverPassengerRating rating) {
    _stars = rating.stars;
    _selected
      ..clear()
      ..addAll(rating.reasons);
    _comment.text = rating.comment ?? '';
  }

  Future<void> _save() async {
    if (_saving || _loading || _stored || _stars == 0) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final rating = await widget.api.ratePassenger(
        rideId: widget.rideId,
        stars: _stars,
        reasons: _selected.toList(growable: false),
        comment: _comment.text.trim(),
      );
      if (!mounted) return;
      // Use the persisted response, including an original rating after a lost response/retry.
      setState(() {
        _apply(rating);
        _saving = false;
        _stored = true;
      });
    } on DriverApiException catch (error) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = error.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = 'Não conseguimos confirmar a avaliação. Seus dados foram mantidos; tente novamente.';
        });
      }
    }
  }

  bool get _editable => !_loading && !_saving && !_stored;
  String get _label => switch (_stars) {
    1 => 'Muito ruim',
    2 => 'Ruim',
    3 => 'Regular',
    4 => 'Muito bom',
    5 => 'Excelente',
    _ => 'Toque nas estrelas para avaliar',
  };
  void _close() {
    if (!_saving) Navigator.of(context).pop(_stored);
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final narrow = size.width < 375;
    return PopScope(
      canPop: !_saving,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          12,
          0,
          12,
          MediaQuery.viewInsetsOf(context).bottom + 12,
        ),
        child: RamoWebMapOverlay(
          child: Material(
            color: Colors.white,
            borderRadius: const BorderRadius.all(Radius.circular(32)),
            clipBehavior: Clip.antiAlias,
            child: SafeArea(
              top: false,
              child: SingleChildScrollView(
                child: SizedBox(
                  height:
                      (size.height * .94 -
                              MediaQuery.viewInsetsOf(context).bottom -
                              12)
                          .clamp(360.0, 1100.0),
                  child: Column(
                    children: [
                      const SizedBox(height: 10),
                      Container(
                        width: 38,
                        height: 5,
                        decoration: BoxDecoration(
                          color: const Color(0xFF989DA7),
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
                        child: Row(
                          children: [
                            IconButton.filledTonal(
                              tooltip: 'Voltar',
                              onPressed: _saving ? null : _close,
                              style: IconButton.styleFrom(
                                backgroundColor: const Color(0xFFF0F1F3),
                                foregroundColor: _ink,
                              ),
                              icon: const Icon(
                                Icons.arrow_back_ios_new_rounded,
                                size: 22,
                              ),
                            ),
                            const Expanded(
                              child: Text(
                                'Avaliar passageiro',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: _ink,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            const SizedBox(width: 48),
                          ],
                        ),
                      ),
                      Expanded(
                        child: SingleChildScrollView(
                          padding: EdgeInsets.symmetric(
                            horizontal: narrow ? 14 : 18,
                            vertical: 12,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Center(
                                child: Container(
                                  width: narrow ? 82 : 88,
                                  height: narrow ? 82 : 88,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: const Color(0xFFE8E9EB),
                                    border: Border.all(
                                      color: const Color(0xFFFFF0B0),
                                      width: 10,
                                    ),
                                  ),
                                  child: const Icon(
                                    Icons.person_rounded,
                                    size: 58,
                                    color: Color(0xFF272D33),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                'Como foi sua experiência?',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: _ink,
                                  fontWeight: FontWeight.w800,
                                  fontSize: narrow ? 20 : 22,
                                ),
                              ),
                              const SizedBox(height: 4),
                              const Text(
                                'Sua avaliação ajuda a manter o Ramo Nessa seguro e agradável para todos.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: _muted,
                                  fontSize: 15,
                                  height: 1.35,
                                ),
                              ),
                              const SizedBox(height: 14),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: List.generate(
                                  5,
                                  (i) => Flexible(
                                    child: IconButton(
                                      key: ValueKey(
                                        'passenger-rating-star-${i + 1}',
                                      ),
                                      tooltip:
                                          '${i + 1} ${i == 0 ? 'estrela' : 'estrelas'}',
                                      onPressed: _editable
                                          ? () => setState(() => _stars = i + 1)
                                          : null,
                                      padding: EdgeInsets.zero,
                                      iconSize: 44,
                                      style: IconButton.styleFrom(
                                        foregroundColor: i < _stars
                                            ? _yellow
                                            : const Color(0xFF9AA0AA),
                                        disabledForegroundColor: i < _stars
                                            ? _yellow
                                            : const Color(0xFF9AA0AA),
                                      ),
                                      color: i < _stars
                                          ? _yellow
                                          : const Color(0xFF9AA0AA),
                                      icon: Icon(
                                        i < _stars
                                            ? Icons.star_rounded
                                            : Icons.star_border_rounded,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                              Text(
                                _label,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: _ink,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: 12),
                                child: Divider(height: 1),
                              ),
                              const Text(
                                'O que você achou do passageiro?',
                                style: TextStyle(
                                  color: _ink,
                                  fontSize: 17,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const Text(
                                'Selecione onde se aplica',
                                style: TextStyle(color: _muted, fontSize: 14),
                              ),
                              const SizedBox(height: 10),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: _reasons.entries
                                    .map(
                                      (entry) => FilterChip(
                                        label: Text(entry.value),
                                        selected: _selected.contains(entry.key),
                                        showCheckmark: false,
                                        avatar: _selected.contains(entry.key)
                                            ? const CircleAvatar(
                                                radius: 10,
                                                backgroundColor: _ink,
                                                child: Icon(
                                                  Icons.check_rounded,
                                                  color: _yellow,
                                                  size: 14,
                                                ),
                                              )
                                            : null,
                                        onSelected: _editable
                                            ? (selected) => setState(() {
                                                if (selected) {
                                                  _selected.add(entry.key);
                                                } else {
                                                  _selected.remove(entry.key);
                                                }
                                              })
                                            : null,
                                        selectedColor: _yellow,
                                        backgroundColor: const Color(
                                          0xFFF0F1F3,
                                        ),
                                        disabledColor:
                                            _selected.contains(entry.key)
                                            ? _yellow
                                            : const Color(0xFFF0F1F3),
                                        side: BorderSide.none,
                                        shape: const StadiumBorder(),
                                        labelStyle: const TextStyle(
                                          color: _ink,
                                          fontWeight: FontWeight.w600,
                                          fontSize: 14,
                                        ),
                                        checkmarkColor: _ink,
                                      ),
                                    )
                                    .toList(growable: false),
                              ),
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: 12),
                                child: Divider(height: 1),
                              ),
                              const Wrap(
                                alignment: WrapAlignment.spaceBetween,
                                spacing: 8,
                                children: [
                                  Text(
                                    'Quer deixar algum comentário?',
                                    style: TextStyle(
                                      color: _ink,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 16,
                                    ),
                                  ),
                                  Text(
                                    '(Opcional)',
                                    style: TextStyle(
                                      color: _muted,
                                      fontSize: 14,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              TextField(
                                key: const Key('passenger-rating-comment'),
                                controller: _comment,
                                enabled: _editable,
                                minLines: 3,
                                maxLines: 5,
                                maxLength: 1000,
                                style: const TextStyle(color: _ink),
                                decoration: InputDecoration(
                                  hintText:
                                      'Conte um pouco sobre sua experiência...',
                                  hintStyle: const TextStyle(color: _muted),
                                  filled: true,
                                  fillColor: const Color(0xFFF0F1F3),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(22),
                                    borderSide: BorderSide.none,
                                  ),
                                ),
                              ),
                              if (_loading)
                                const Center(
                                  child: CircularProgressIndicator(),
                                ),
                              if (_stored)
                                Semantics(
                                  liveRegion: true,
                                  child: const Text(
                                    'Avaliação registrada. Obrigado!',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: Color(0xFF20753E),
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              if (_error != null) ...[
                                Semantics(
                                  liveRegion: true,
                                  child: Text(
                                    _error!,
                                    style: const TextStyle(
                                      color: Color(0xFFB3261E),
                                    ),
                                  ),
                                ),
                                if (_stars == 0)
                                  TextButton(
                                    onPressed: _loading ? null : _load,
                                    child: const Text('Tentar novamente'),
                                  ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (!_stored) ...[
                              FilledButton(
                                key: const Key('confirm-passenger-rating'),
                                onPressed: _editable && _stars > 0
                                    ? _save
                                    : null,
                                style: FilledButton.styleFrom(
                                  backgroundColor: _yellow,
                                  foregroundColor: _ink,
                                  minimumSize: const Size(0, 48),
                                  textStyle: const TextStyle(
                                    fontFamily: 'Roboto',
                                    fontSize: 17,
                                    fontWeight: FontWeight.w800,
                                  ),
                                  shape: const StadiumBorder(),
                                ),
                                child: _saving
                                    ? const SizedBox.square(
                                        dimension: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: _ink,
                                        ),
                                      )
                                    : const Text('Confirmar avaliação'),
                              ),
                              const SizedBox(height: 8),
                            ],
                            OutlinedButton(
                              onPressed: _saving ? null : _close,
                              style: OutlinedButton.styleFrom(
                                foregroundColor: _ink,
                                side: const BorderSide(color: _ink),
                                minimumSize: const Size(0, 48),
                                textStyle: const TextStyle(
                                  fontFamily: 'Roboto',
                                  fontSize: 17,
                                  fontWeight: FontWeight.w700,
                                ),
                                shape: const StadiumBorder(),
                              ),
                              child: Text(
                                _stored ? 'Voltar para o mapa' : 'Agora não',
                              ),
                            ),
                          ],
                        ),
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
  }
}
