import 'package:flutter/foundation.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
import 'card_checkout_screen.dart';
import '../data/saved_card_service.dart';
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ramo_design_system/ramo_design_system.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../rides/data/passenger_ride_realtime_service.dart';
import '../../rides/data/passenger_ride_tracking_service.dart';
import '../../rides/domain/prepared_ride.dart';
import '../../rides/data/driver_confirmation_service.dart';
import '../../rides/presentation/ride_tracking_screen.dart';
import '../../map/data/route_service.dart';
import '../data/card_tokenization_service.dart';
import '../data/passenger_payment_service.dart';
import '../domain/card_ride_payment_result.dart';
import '../domain/passenger_payment_policy.dart';
import '../domain/pix_ride_payment_result.dart';

class RidePaymentScreen extends StatefulWidget {
  const RidePaymentScreen({
    super.key,
    required this.ride,
    this.paymentService,
    this.cardTokenizationService,
    this.rideTrackingService,
    this.rideRealtimeService,
    this.routeService,
    this.networkTilesEnabled = true,
    this.pickupLatitude,
    this.pickupLongitude,
  });

  final PreparedRide ride;
  final double? pickupLatitude, pickupLongitude;
  final PassengerPaymentService? paymentService;
  final CardTokenizationService? cardTokenizationService;
  final PassengerRideTrackingService? rideTrackingService;
  final PassengerRideRealtimeService? rideRealtimeService;
  final RouteService? routeService;
  final bool networkTilesEnabled;

  @override
  State<RidePaymentScreen> createState() => _RidePaymentScreenState();
}

class _RidePaymentScreenState extends State<RidePaymentScreen> {
  Timer? _confirmationTimer;
  bool _findingDriver = false;
  bool _confirmationRequestInFlight = false;
  bool _paymentOptionsOpen = false;
  bool _leaving = false;
  DriverConfirmation? _confirmation;
  String? _driverMessage;
  bool get _canPay =>
      !_ride.driverConsentRequired ||
      (_confirmation?.status == 'READY_TO_PAY' && _paymentOptionsOpen);
  DriverConfirmationService? get _confirmationService {
    final service = widget.paymentService;
    return service is DriverConfirmationService
        ? service as DriverConfirmationService
        : null;
  }

  Timer? _timer;
  late PreparedRide _ride;
  bool _confirmingPromotion = false;
  String? _couponError;
  Duration _remaining = Duration.zero;
  int? _walletBalanceCents;
  bool _walletLoading = false;
  bool _payingWallet = false;
  String? _walletMessage;
  bool _creatingPix = false;
  String? _pixMessage;
  bool _creatingCard = false;
  String? _cardMessage;
  PassengerPaymentPolicy? _paymentPolicy;
  bool _paymentPolicyLoading = false;
  bool _authorizingCash = false;
  String? _cashMessage;
  late final String _walletIdempotencyKey;
  late final String _cashIdempotencyKey;
  late final String _pixIdempotencyKey;
  late final String _cardIdempotencyKey;

  @override
  void initState() {
    super.initState();
    _ride = widget.ride;
    _couponError = widget.ride.promotionMessage;
    final nonce = DateTime.now().microsecondsSinceEpoch;
    _walletIdempotencyKey = 'wallet-${_ride.id}-$nonce';
    _cashIdempotencyKey = 'cash-${_ride.id}-$nonce';
    _pixIdempotencyKey = 'pix-${_ride.id}-$nonce';
    _cardIdempotencyKey = 'card-${_ride.id}-$nonce';
    _updateRemaining();
    _timer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => _updateRemaining(),
    );
    _loadPaymentPolicy();
    if (_ride.driverConsentRequired) unawaited(_findDriver());
  }

  Future<void> _findDriver() async {
    final service = _confirmationService;
    if (service == null || _findingDriver) return;
    setState(() {
      _findingDriver = true;
      _driverMessage = null;
    });
    try {
      await service.requestDriverConfirmation(_ride.id);
      await _refreshDriverConfirmation();
      if (!mounted) return;
      _confirmationTimer?.cancel();
      _confirmationTimer = Timer.periodic(
        const Duration(seconds: 3),
        (_) => _refreshDriverConfirmation(),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _findingDriver = false;
        _driverMessage = error is PassengerPaymentException
            ? error.message
            : 'Não conseguimos encontrar um motorista agora.';
      });
    }
  }

  Future<void> _refreshDriverConfirmation() async {
    final service = _confirmationService;
    if (service == null || _confirmationRequestInFlight || _leaving) return;
    _confirmationRequestInFlight = true;
    try {
      final confirmation = await service.driverConfirmation(_ride.id);
      if (!mounted) return;
      setState(() {
        _confirmation = confirmation;
        _ride = confirmation.ride;
        _driverMessage = null;
      });
      _updateRemaining();
      if (confirmation.status == 'EXPIRED' ||
          confirmation.status == 'NO_DRIVER_FOUND') {
        _confirmationTimer?.cancel();
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _driverMessage =
              'Não conseguimos confirmar a disponibilidade. Tente novamente.';
          _paymentOptionsOpen = false;
        });
      }
    } finally {
      _confirmationRequestInFlight = false;
    }
  }

  Future<void> _leaveReservation() async {
    if (_leaving) return;
    try {
      await _confirmationService?.releaseDriverReservation(_ride.id);
      if (!mounted) return;
      setState(() => _leaving = true);
      _confirmationTimer?.cancel();
      Navigator.of(context).pop();
    } catch (error) {
      if (mounted) {
        setState(
          () => _driverMessage = error is PassengerPaymentException
              ? error.message
              : 'Não conseguimos cancelar agora. Tente novamente.',
        );
      }
    }
  }

  Widget _driverConfirmationCard() {
    final driver = _confirmation?.driver;
    final ready = _confirmation?.status == 'READY_TO_PAY' && driver != null;
    final unavailable = [
      'EXPIRED',
      'NO_DRIVER_FOUND',
    ].contains(_confirmation?.status);
    return AnimatedSize(
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : const Duration(milliseconds: 320),
      alignment: Alignment.topCenter,
      child: RamoReveal(
        key: ValueKey(
          ready
              ? driver.plate
              : unavailable
              ? 'unavailable'
              : 'search',
        ),
        child: Container(
          padding: const EdgeInsets.all(RamoSpacing.lg),
          decoration: BoxDecoration(
            color: RamoColors.surfaceRaised,
            borderRadius: BorderRadius.circular(RamoRadius.lg),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                ready
                    ? 'Seu motorista está pronto para te buscar!'
                    : unavailable
                    ? 'Nenhum motorista confirmado'
                    : _findingDriver
                    ? 'Aguardando o aceite do motorista…'
                    : 'Encontre seu motorista antes de pagar',
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 16),
              if (driver != null && ready) ...[
                RamoReveal(
                  delay: const Duration(milliseconds: 60),
                  child: Row(
                    children: [
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          CircleAvatar(
                            radius: 32,
                            backgroundImage: driver.photoUrl == null
                                ? null
                                : NetworkImage(driver.photoUrl!),
                            onBackgroundImageError: driver.photoUrl == null
                                ? null
                                : (_, __) {},
                            child: driver.photoUrl == null
                                ? const Icon(Icons.person_rounded, size: 32)
                                : null,
                          ),
                          const Positioned(
                            bottom: -2,
                            right: -2,
                            child: RamoSuccessMark(size: 24),
                          ),
                        ],
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              driver.name,
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            Text('${driver.vehicle} · ${driver.plate}'),
                            if (driver.ratingCount > 0 &&
                                driver.ratingAverage != null)
                              Text(
                                '★ ${driver.ratingAverage!.toStringAsFixed(1)} · ${driver.ratingCount} avaliações',
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                RamoReveal(
                  delay: const Duration(milliseconds: 100),
                  child: Text(
                    driver.arrivalSeconds == null
                        ? 'Previsão de chegada indisponível no momento'
                        : 'Chega em aproximadamente ${(driver.arrivalSeconds! / 60).ceil().clamp(1, 999)} minutos',
                  ),
                ),
                const SizedBox(height: 8),
                RamoReveal(
                  delay: const Duration(milliseconds: 140),
                  child: Text('Valor da corrida: ${_ride.formattedPayable}'),
                ),
                const SizedBox(height: 16),
                if (!_paymentOptionsOpen)
                  RamoReveal(
                    delay: const Duration(milliseconds: 180),
                    child: FilledButton(
                      key: const Key('confirm-driver-and-pay'),
                      onPressed:
                          _remaining == Duration.zero || _driverMessage != null
                          ? null
                          : () => setState(() => _paymentOptionsOpen = true),
                      child: const Text('Confirmar e pagar'),
                    ),
                  ),
              ] else if (!_findingDriver)
                FilledButton(
                  key: const Key('find-driver-before-payment'),
                  onPressed: _remaining == Duration.zero ? null : _findDriver,
                  child: const Text('Encontrar motorista'),
                )
              else if (!unavailable)
                SizedBox(
                  height: 190,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(20),
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        if (widget.networkTilesEnabled &&
                            !kIsWeb &&
                            (defaultTargetPlatform == TargetPlatform.android ||
                                defaultTargetPlatform == TargetPlatform.iOS) &&
                            widget.pickupLatitude != null &&
                            widget.pickupLongitude != null)
                          IgnorePointer(
                            child: gm.GoogleMap(
                              initialCameraPosition: gm.CameraPosition(
                                target: gm.LatLng(
                                  widget.pickupLatitude!,
                                  widget.pickupLongitude!,
                                ),
                                zoom: 15,
                              ),
                              myLocationButtonEnabled: false,
                              zoomControlsEnabled: false,
                              mapToolbarEnabled: false,
                              compassEnabled: false,
                            ),
                          ),
                        const RamoSearchPulse(
                          label: 'Aguardando o aceite do motorista…',
                        ),
                      ],
                    ),
                  ),
                ),
              if (unavailable)
                const Text(
                  'Volte e tente novamente. Nenhum pagamento foi solicitado.',
                ),
              if (_driverMessage != null) Text(_driverMessage!),
              TextButton(
                onPressed: _leaveReservation,
                child: const Text('Voltar e cancelar reserva'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _confirmFullyPromotionalRide() async {
    final service = widget.paymentService;
    if (service == null ||
        _confirmingPromotion ||
        _ride.promotion == null ||
        _ride.payableAmountCents != 0 ||
        _remaining == Duration.zero) {
      return;
    }

    setState(() {
      _confirmingPromotion = true;
      _couponError = null;
    });

    try {
      final result = await service.confirmFullyPromotionalRide(_ride.id);
      if (!mounted) return;

      final tracking = widget.rideTrackingService;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => tracking == null
              ? _PromotionConfirmedScreen(dispatchStatus: result.dispatchStatus)
              : RideTrackingScreen(
                  rideId: _ride.id,
                  remainingWalletCents: null,
                  paymentMethod: 'promotion',
                  trackingService: tracking,
                  realtimeService: widget.rideRealtimeService,
                  routeService: widget.routeService,
                  initialDispatchStatus: result.dispatchStatus,
                  networkTilesEnabled: widget.networkTilesEnabled,
                ),
        ),
      );
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _confirmingPromotion = false;
        _couponError = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _confirmingPromotion = false;
        _couponError = 'Não conseguimos confirmar a corrida promocional agora.';
      });
    }
  }

  Future<void> _loadPaymentPolicy() async {
    final service = widget.paymentService;
    if (service == null) return;

    setState(() {
      _paymentPolicyLoading = true;
      _cashMessage = null;
    });

    try {
      final policy = await service.paymentPolicy();
      if (!mounted) return;
      setState(() {
        _paymentPolicy = policy;
        _paymentPolicyLoading = false;
        if (!policy.walletAvailable) {
          _walletBalanceCents = null;
          _walletMessage = null;
          _walletLoading = false;
        }
      });
      if (policy.walletAvailable) {
        await _loadWallet();
      }
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _paymentPolicyLoading = false;
        _cashMessage = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _paymentPolicyLoading = false;
        _cashMessage =
            'Não conseguimos consultar o pagamento em dinheiro agora.';
      });
    }
  }

  Future<void> _loadWallet() async {
    final service = widget.paymentService;
    if (service == null) return;

    setState(() {
      _walletLoading = true;
      _walletMessage = null;
    });

    try {
      final balance = await service.walletBalanceCents();
      if (!mounted) return;
      setState(() {
        _walletBalanceCents = balance;
        _walletLoading = false;
      });
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _walletLoading = false;
        _walletMessage = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _walletLoading = false;
        _walletMessage = 'Não conseguimos consultar a carteira agora.';
      });
    }
  }

  void _updateRemaining() {
    final remaining = _ride.holdExpiresAt.difference(DateTime.now());
    if (!mounted) return;

    setState(() {
      _remaining = remaining.isNegative ? Duration.zero : remaining;
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _confirmationTimer?.cancel();
    super.dispose();
  }

  String get _countdown {
    final seconds = _remaining.inSeconds;
    final minutes = seconds ~/ 60;
    final rest = (seconds % 60).toString().padLeft(2, '0');
    return '$minutes:$rest';
  }

  bool get _pixAvailable => _paymentPolicy?.pixAvailable == true;

  bool get _cardAvailable => _paymentPolicy?.cardAvailable == true;

  bool get _walletAvailable => _paymentPolicy?.walletAvailable == true;

  bool get _walletHasEnough =>
      _walletAvailable &&
      _walletBalanceCents != null &&
      _walletBalanceCents! >= _ride.payableAmountCents;

  bool get _cashAvailable =>
      _ride.promotion == null && _paymentPolicy?.cashAvailable == true;

  int get _pixTotalAmountCents => _ride.promotion != null
      ? _ride.payableAmountCents
      : _paymentPolicy?.pixTotalAmountCents(_ride.payableAmountCents) ??
            _ride.payableAmountCents;

  int get _pixAdjustmentCents => _ride.promotion != null
      ? 0
      : _paymentPolicy?.pixAdjustmentCents(_ride.payableAmountCents) ?? 0;

  int get _cardTotalAmountCents => _ride.promotion != null
      ? _ride.payableAmountCents
      : _paymentPolicy?.cardTotalAmountCents(_ride.payableAmountCents) ??
            _ride.payableAmountCents;

  int get _cardAdjustmentCents => _ride.promotion != null
      ? 0
      : _paymentPolicy?.cardAdjustmentCents(_ride.payableAmountCents) ?? 0;

  Future<void> _startPix() async {
    final service = widget.paymentService;
    if (service == null ||
        _creatingPix ||
        _remaining == Duration.zero ||
        _paymentPolicyLoading ||
        !_pixAvailable) {
      return;
    }

    setState(() {
      _creatingPix = true;
      _pixMessage = null;
    });

    try {
      final result = await service.createPixRidePayment(
        rideId: _ride.id,
        idempotencyKey: _pixIdempotencyKey,
      );

      if (!mounted) return;
      setState(() => _creatingPix = false);

      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => _PixPaymentScreen(
            rideId: _ride.id,
            holdExpiresAt: _ride.holdExpiresAt,
            amountLabel: PreparedRide.formatCents(_pixTotalAmountCents),
            driverReserved: _ride.driverConsentRequired,
            result: result,
            trackingService: widget.rideTrackingService,
            realtimeService: widget.rideRealtimeService,
            routeService: widget.routeService,
            networkTilesEnabled: widget.networkTilesEnabled,
          ),
        ),
      );
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _creatingPix = false;
        _pixMessage = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _creatingPix = false;
        _pixMessage = 'Não conseguimos gerar o Pix agora.';
      });
    }
  }

  Future<void> _startCard() async {
    final service = widget.paymentService;
    if (service == null ||
        _creatingCard ||
        _remaining == Duration.zero ||
        _paymentPolicyLoading ||
        !_cardAvailable) {
      return;
    }

    setState(() {
      _creatingCard = true;
      _cardMessage = null;
    });

    try {
      final tokenizer =
          widget.cardTokenizationService ??
          NativeCardTokenizationService(
            amountCents: _cardTotalAmountCents,
            mercadoPagoPublicKey: _paymentPolicy?.mercadoPagoPublicKey,
          );
      final selection = await Navigator.of(context).push<CardCheckoutSelection>(
        MaterialPageRoute(
          builder: (_) => CardCheckoutScreen(
            tokenizer: tokenizer,
            amountLabel: PreparedRide.formatCents(_cardTotalAmountCents),
            holdExpiresAt: _ride.holdExpiresAt,
            cards: service is SavedCardService
                ? service as SavedCardService
                : null,
          ),
        ),
      );
      if (selection == null || !mounted) {
        if (mounted) setState(() => _creatingCard = false);
        return;
      }
      _updateRemaining();
      if (_remaining == Duration.zero || !_canPay) {
        throw const PassengerPaymentException(
          'A reserva expirou ou o motorista ficou indisponível. Solicite novamente.',
        );
      }
      final tokenized = selection.card;
      if (!mounted) return;

      final result = service is SavedCardService
          ? await (service as SavedCardService).payWithCard(
              rideId: _ride.id,
              idempotencyKey: _cardIdempotencyKey,
              card: tokenized,
              payerEmail: selection.email,
              savedCardId: selection.savedCardId,
            )
          : await service.createCardRidePayment(
              rideId: _ride.id,
              idempotencyKey: _cardIdempotencyKey,
              cardToken: tokenized.token,
              paymentMethodId: tokenized.paymentMethodId,
              paymentMethodType: tokenized.paymentMethodType,
            );

      if (!mounted) return;
      setState(() => _creatingCard = false);

      final failed =
          result.internalPaymentStatus == 'failed' ||
          result.internalPaymentStatus == 'cancelled' ||
          result.rideState == 'PAYMENT_FAILED';
      if (failed) {
        setState(() {
          _cardMessage =
              'Pagamento não aprovado. Confira os dados ou tente outro cartão.';
        });
        return;
      }

      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => _CardPaymentStatusScreen(
            rideId: _ride.id,
            result: result,
            trackingService: widget.rideTrackingService,
            realtimeService: widget.rideRealtimeService,
            routeService: widget.routeService,
            networkTilesEnabled: widget.networkTilesEnabled,
          ),
        ),
      );
    } on CardTokenizationException catch (error) {
      if (!mounted) return;
      setState(() {
        _creatingCard = false;
        _cardMessage = error.message;
      });
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _creatingCard = false;
        _cardMessage = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _creatingCard = false;
        _cardMessage = 'Não conseguimos concluir o pagamento por cartão agora.';
      });
    }
  }

  Future<void> _authorizeCash() async {
    final service = widget.paymentService;
    if (service == null || !_cashAvailable || _authorizingCash) {
      return;
    }

    setState(() {
      _authorizingCash = true;
      _cashMessage = null;
    });

    try {
      final result = await service.authorizeCashRide(
        rideId: _ride.id,
        idempotencyKey: _cashIdempotencyKey,
      );

      if (!mounted) return;
      if (!result.authorized) {
        setState(() {
          _authorizingCash = false;
          _cashMessage =
              'O pagamento em dinheiro ainda não pôde ser autorizado.';
        });
        return;
      }

      if (result.dispatchStatus == 'NO_DRIVER_FOUND') {
        setState(() {
          _authorizingCash = false;
          _cashMessage =
              'Não encontramos motorista disponível agora. '
              'Nenhum valor foi cobrado.';
        });
        return;
      }

      final tracking = widget.rideTrackingService;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => tracking == null
              ? _CashAuthorizedScreen(
                  amountCents: result.amountCents,
                  dispatchStatus: result.dispatchStatus,
                )
              : RideTrackingScreen(
                  rideId: _ride.id,
                  remainingWalletCents: null,
                  paymentMethod: 'cash',
                  trackingService: tracking,
                  realtimeService: widget.rideRealtimeService,
                  routeService: widget.routeService,
                  initialDispatchStatus: result.dispatchStatus,
                  networkTilesEnabled: widget.networkTilesEnabled,
                ),
        ),
      );
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _authorizingCash = false;
        _cashMessage = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _authorizingCash = false;
        _cashMessage =
            'Não conseguimos autorizar o pagamento em dinheiro agora.';
      });
    }
  }

  Future<void> _payWallet() async {
    final service = widget.paymentService;
    if (service == null ||
        !_walletAvailable ||
        !_walletHasEnough ||
        _payingWallet) {
      return;
    }

    setState(() {
      _payingWallet = true;
      _walletMessage = null;
    });

    try {
      final result = await service.payRideWithWallet(
        rideId: _ride.id,
        idempotencyKey: _walletIdempotencyKey,
      );

      if (!mounted) return;
      if (result.paymentRefunded) {
        setState(() {
          _payingWallet = false;
          _walletBalanceCents = result.walletBalanceCents;
          _walletMessage = result.dispatchStatus == 'NO_DRIVER_FOUND'
              ? 'Não encontramos motorista disponível. '
                    'O valor voltou integralmente para sua Carteira Ramo Nessa.'
              : 'A corrida não pôde ser liberada e o valor voltou '
                    'integralmente para sua Carteira Ramo Nessa.';
        });
        return;
      }

      if (!result.paymentConfirmed) {
        setState(() {
          _payingWallet = false;
          _walletBalanceCents = result.walletBalanceCents;
          _walletMessage =
              'Ainda não conseguimos confirmar o pagamento da corrida.';
        });
        return;
      }

      final tracking = widget.rideTrackingService;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => tracking == null
              ? _PaymentConfirmedScreen(
                  remainingWalletCents: result.walletBalanceCents,
                  dispatchStatus: result.dispatchStatus,
                )
              : RideTrackingScreen(
                  rideId: _ride.id,
                  remainingWalletCents: result.walletBalanceCents,
                  paymentMethod: 'wallet',
                  trackingService: tracking,
                  realtimeService: widget.rideRealtimeService,
                  routeService: widget.routeService,
                  initialDispatchStatus: result.dispatchStatus,
                  networkTilesEnabled: widget.networkTilesEnabled,
                ),
        ),
      );
    } on PassengerPaymentException catch (error) {
      if (!mounted) return;
      setState(() {
        _payingWallet = false;
        _walletMessage = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _payingWallet = false;
        _walletMessage = 'Não conseguimos concluir o pagamento agora.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final expired = _remaining == Duration.zero;
    final cashSubtitle = _ride.promotion != null
        ? 'Cupons são pagos por Pix, cartão ou carteira'
        : _paymentPolicyLoading
        ? 'Verificando disponibilidade…'
        : _cashAvailable
        ? 'Pague diretamente ao motorista no fim da corrida'
        : 'Em breve · será liberado pelo Ramo Nessa';

    final pixPrice = PreparedRide.formatCents(_pixTotalAmountCents);
    final pixAdjustment = PreparedRide.formatCents(_pixAdjustmentCents);
    final pixSubtitle = _paymentPolicyLoading
        ? 'Calculando preço final no Pix…'
        : _paymentPolicy == null
        ? 'Preço indisponível até atualizar as formas de pagamento'
        : !_pixAvailable
        ? 'Indisponível no momento'
        : _pixAdjustmentCents > 0
        ? 'À vista · diferença de $pixAdjustment já incluída no preço final'
        : 'À vista · sem diferença no Pix';
    final cardPrice = PreparedRide.formatCents(_cardTotalAmountCents);
    final cardAdjustment = PreparedRide.formatCents(_cardAdjustmentCents);
    final cardSubtitle = _paymentPolicyLoading
        ? 'Calculando preço final no cartão…'
        : _paymentPolicy == null
        ? 'Preço indisponível até atualizar as formas de pagamento'
        : !_cardAvailable
        ? 'Indisponível no momento'
        : _cardAdjustmentCents > 0
        ? 'À vista · diferença de $cardAdjustment já incluída no preço final'
        : 'À vista · mesmo preço do Pix';

    final walletSubtitle = !_walletAvailable && _paymentPolicy != null
        ? 'Indisponível no momento'
        : switch ((
            widget.paymentService,
            _walletLoading,
            _walletBalanceCents,
          )) {
            (null, _, _) => 'Será habilitada com a autenticação do passageiro',
            (_, true, _) => 'Consultando saldo…',
            (_, false, final int balance) =>
              'Saldo: ${PreparedRide.formatCents(balance)}',
            _ => _walletMessage ?? 'Saldo indisponível agora',
          };

    return PopScope(
      canPop: !_ride.driverConsentRequired || _leaving,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) _leaveReservation();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            _ride.driverConsentRequired
                ? (_canPay ? 'Pagamento' : 'Confirmar corrida')
                : 'Preço e pagamento',
          ),
          leading: _ride.driverConsentRequired
              ? IconButton(
                  icon: const Icon(Icons.arrow_back),
                  onPressed: _leaveReservation,
                )
              : null,
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(RamoSpacing.lg),
            children: [
              Container(
                padding: const EdgeInsets.all(RamoSpacing.lg),
                decoration: BoxDecoration(
                  color: RamoColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(RamoRadius.lg),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.route_rounded, size: 24),
                    const SizedBox(width: RamoSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _ride.promotion == null
                                ? 'Tarifa-base da corrida'
                                : 'Preço com cupom',
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: RamoColors.muted),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _ride.promotion == null
                                ? _ride.formattedTotal
                                : _ride.formattedPayable,
                            style: Theme.of(context).textTheme.headlineSmall
                                ?.copyWith(fontWeight: FontWeight.w900),
                          ),
                          if (_ride.promotion != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              'Preço normal: ${PreparedRide.formatCents(_ride.promotion!.normalTotalCents)}',
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: RamoColors.muted,
                                    decoration: TextDecoration.lineThrough,
                                  ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const Icon(Icons.lock_rounded, size: 18),
                  ],
                ),
              ),
              if (_ride.pickupCompensationCents > 0) ...[
                const SizedBox(height: RamoSpacing.sm),
                _PriceRow(
                  label: 'Coleta distante · 100% motorista',
                  cents: _ride.pickupCompensationCents,
                ),
              ],
              const SizedBox(height: RamoSpacing.md),
              Container(
                padding: const EdgeInsets.all(RamoSpacing.md),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(RamoRadius.md),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.lock_clock_rounded),
                    const SizedBox(width: RamoSpacing.sm),
                    Expanded(
                      child: Text(
                        expired
                            ? 'A reserva expirou. Volte e atualize a corrida.'
                            : 'Preço e motorista reservados por $_countdown.',
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: RamoSpacing.xl),
              if (_ride.promotion != null)
                Text('Cupom ativado no Perfil: ${_ride.promotion!.code}'),
              if (_ride.promotionMessage != null) Text(_ride.promotionMessage!),
              if (_couponError != null) ...[
                const SizedBox(height: RamoSpacing.sm),
                Text(
                  _couponError!,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
              ],
              const SizedBox(height: RamoSpacing.xl),
              if (_ride.driverConsentRequired) ...[
                _driverConfirmationCard(),
                const SizedBox(height: RamoSpacing.lg),
              ],
              if (_canPay) ...[
                if (_ride.payableAmountCents == 0) ...[
                  Container(
                    padding: const EdgeInsets.all(RamoSpacing.lg),
                    decoration: BoxDecoration(
                      color: RamoColors.surfaceRaised,
                      borderRadius: BorderRadius.circular(RamoRadius.lg),
                    ),
                    child: Column(
                      children: [
                        const Icon(
                          Icons.redeem_rounded,
                          size: 42,
                          color: RamoColors.signal,
                        ),
                        const SizedBox(height: RamoSpacing.sm),
                        Text(
                          'Sua corrida ficou grátis',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.titleLarge
                              ?.copyWith(fontWeight: FontWeight.w900),
                        ),
                        const SizedBox(height: RamoSpacing.xs),
                        Text(
                          'Não é necessário gerar Pix nem cobrar cartão. Confirme para liberar seu motorista.',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(color: RamoColors.muted),
                        ),
                        const SizedBox(height: RamoSpacing.lg),
                        FilledButton(
                          key: const Key('ride-payment-promotion-confirm'),
                          onPressed: expired || _confirmingPromotion
                              ? null
                              : _confirmFullyPromotionalRide,
                          child: _confirmingPromotion
                              ? const SizedBox.square(
                                  dimension: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Text('Confirmar corrida grátis'),
                        ),
                      ],
                    ),
                  ),
                ] else ...[
                  Text(
                    'Formas de pagamento',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: RamoSpacing.xs),
                  _PaymentOption(
                    key: const Key('payment-option-pix'),
                    icon: Icons.pix_rounded,
                    title: _paymentPolicy == null ? 'Pix' : 'Pix · $pixPrice',
                    subtitle: pixSubtitle,
                    enabled:
                        !expired &&
                        widget.paymentService != null &&
                        !_creatingPix &&
                        !_paymentPolicyLoading &&
                        _pixAvailable,
                    trailing: _creatingPix
                        ? const SizedBox.square(
                            dimension: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : null,
                    onTap: _startPix,
                  ),
                  const SizedBox(height: RamoSpacing.sm),
                  _PaymentOption(
                    key: const Key('payment-option-card'),
                    icon: Icons.credit_card_rounded,
                    title: _paymentPolicy == null
                        ? 'Cartão'
                        : 'Cartão · $cardPrice',
                    subtitle: cardSubtitle,
                    enabled:
                        !expired &&
                        widget.paymentService != null &&
                        !_creatingCard &&
                        !_paymentPolicyLoading &&
                        _cardAvailable,
                    trailing: _creatingCard
                        ? const SizedBox.square(
                            dimension: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : null,
                    onTap: _startCard,
                  ),
                  const SizedBox(height: RamoSpacing.xs),
                  Text(
                    'Os preços podem variar conforme a forma de pagamento. '
                    'O total exibido em cada opção é o valor cobrado.',
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: RamoColors.muted),
                  ),
                  const SizedBox(height: RamoSpacing.sm),
                  _PaymentOption(
                    key: const Key('payment-option-wallet'),
                    icon: Icons.account_balance_wallet_rounded,
                    title: 'Carteira Ramo Nessa',
                    subtitle: walletSubtitle,
                    enabled:
                        !expired &&
                        _walletAvailable &&
                        !_walletLoading &&
                        _walletHasEnough &&
                        !_payingWallet,
                    trailing: _payingWallet
                        ? const SizedBox.square(
                            dimension: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : null,
                    onTap: _payWallet,
                  ),
                  const SizedBox(height: RamoSpacing.sm),
                  _PaymentOption(
                    key: const Key('payment-option-cash'),
                    icon: Icons.payments_rounded,
                    title: 'Dinheiro',
                    subtitle: cashSubtitle,
                    enabled:
                        !expired &&
                        !_paymentPolicyLoading &&
                        _cashAvailable &&
                        !_authorizingCash,
                    trailing: _authorizingCash
                        ? const SizedBox.square(
                            dimension: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : !_cashAvailable
                        ? const Chip(
                            label: Text('Em breve'),
                            visualDensity: VisualDensity.compact,
                          )
                        : null,
                    onTap: _authorizeCash,
                  ),
                  if (_pixMessage != null) ...[
                    const SizedBox(height: RamoSpacing.xs),
                    Text(
                      _pixMessage!,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                  if (_cardMessage != null) ...[
                    const SizedBox(height: RamoSpacing.xs),
                    Text(
                      _cardMessage!,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                  if (_cashMessage != null) ...[
                    const SizedBox(height: RamoSpacing.xs),
                    Text(
                      _cashMessage!,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                  if (_walletBalanceCents != null &&
                      !_walletHasEnough &&
                      !_walletLoading) ...[
                    const SizedBox(height: RamoSpacing.xs),
                    Text(
                      'Saldo insuficiente para esta corrida.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                  if (_walletMessage != null) ...[
                    const SizedBox(height: RamoSpacing.sm),
                    Text(
                      _walletMessage!,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                ],
              ],
              const SizedBox(height: RamoSpacing.lg),
            ],
          ),
        ),
      ),
    );
  }
}

class _PromotionConfirmedScreen extends StatelessWidget {
  const _PromotionConfirmedScreen({required this.dispatchStatus});

  final String dispatchStatus;

  @override
  Widget build(BuildContext context) {
    final message = switch (dispatchStatus) {
      'NO_DRIVER_FOUND' =>
        'A corrida promocional foi confirmada, mas não encontramos motorista nesta rodada.',
      'PENDING_RETRY' =>
        'Sua corrida promocional foi confirmada. Estamos tentando encontrar um motorista.',
      _ =>
        'Sua corrida promocional foi confirmada e já estamos procurando um motorista.',
    };

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RamoSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.redeem_rounded,
                size: 82,
                color: RamoColors.signal,
              ),
              const SizedBox(height: RamoSpacing.lg),
              Text(
                'Corrida promocional confirmada',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: RamoSpacing.sm),
              Text(
                message,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: RamoSpacing.xl),
              FilledButton(
                onPressed: () =>
                    Navigator.of(context).popUntil((route) => route.isFirst),
                child: const Text('Voltar ao início'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PixPaymentScreen extends StatefulWidget {
  const _PixPaymentScreen({
    required this.rideId,
    required this.holdExpiresAt,
    required this.amountLabel,
    required this.driverReserved,
    required this.result,
    required this.trackingService,
    required this.realtimeService,
    required this.routeService,
    required this.networkTilesEnabled,
  });

  final String rideId;
  final DateTime holdExpiresAt;
  final String amountLabel;
  final bool driverReserved;
  final PixRidePaymentResult result;
  final PassengerRideTrackingService? trackingService;
  final PassengerRideRealtimeService? realtimeService;
  final RouteService? routeService;
  final bool networkTilesEnabled;

  @override
  State<_PixPaymentScreen> createState() => _PixPaymentScreenState();
}

class _PixPaymentScreenState extends State<_PixPaymentScreen> {
  Timer? _pollTimer;
  Timer? _holdTimer;
  Duration _reservationRemaining = Duration.zero;
  bool _verified = false;
  bool _copied = false;
  Timer? _copyTimer;
  bool _checking = false;
  bool _navigating = false;
  String _statusMessage = 'Aguardando confirmação do Pix…';

  @override
  void initState() {
    super.initState();
    _updateReservationRemaining();
    _holdTimer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => _updateReservationRemaining(),
    );
    if (widget.trackingService != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _checkStatus());
      _pollTimer = Timer.periodic(
        const Duration(seconds: 3),
        (_) => _checkStatus(),
      );
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _holdTimer?.cancel();
    _copyTimer?.cancel();
    super.dispose();
  }

  bool get _reservationExpired => _reservationRemaining == Duration.zero;

  String get _reservationCountdown {
    final seconds = _reservationRemaining.inSeconds;
    final minutes = seconds ~/ 60;
    final rest = (seconds % 60).toString().padLeft(2, '0');
    return '$minutes:$rest';
  }

  void _updateReservationRemaining() {
    final remaining = widget.holdExpiresAt.difference(DateTime.now());
    if (!mounted) return;
    setState(() {
      _reservationRemaining = remaining.isNegative ? Duration.zero : remaining;
    });
  }

  Uint8List? get _qrBytes {
    final raw = widget.result.qrCodeBase64.trim();
    if (raw.isEmpty) return null;
    try {
      final value = raw.contains(',') ? raw.split(',').last : raw;
      return base64Decode(value);
    } catch (_) {
      return null;
    }
  }

  Future<void> _copyPix() async {
    if (_reservationExpired) return;
    final code = widget.result.qrCode.trim();
    if (code.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: code));
    if (!mounted) return;
    setState(() => _copied = true);
    _copyTimer?.cancel();
    _copyTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _copied = false);
    });
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Código Pix copiado.')));
  }

  Future<void> _checkStatus() async {
    final tracking = widget.trackingService;
    if (tracking == null || _checking || _navigating || !mounted) {
      return;
    }

    _checking = true;
    try {
      final snapshot = await tracking.tracking(widget.rideId);
      if (!mounted) return;

      if (snapshot.state == 'PAYMENT_FAILED') {
        _pollTimer?.cancel();
        setState(() {
          _statusMessage =
              'Pagamento não aprovado. Volte ao início e tente novamente.';
        });
        return;
      }

      const confirmedStates = {
        'PAID',
        'SEARCHING_DRIVER',
        'DRIVER_ASSIGNED',
        'DRIVER_ARRIVING',
        'DRIVER_ARRIVED',
        'IN_PROGRESS',
        'COMPLETED',
        'NO_DRIVER_FOUND',
        'REFUND_PENDING',
        'REFUNDED',
      };

      if (!confirmedStates.contains(snapshot.state)) {
        if (mounted) {
          setState(() {
            _statusMessage = _reservationExpired
                ? 'A reserva expirou. Não faça mais este Pix. '
                      'Se você já pagou, vamos confirmar ou estornar '
                      'automaticamente.'
                : 'Aguardando confirmação do Pix…';
          });
        }
        return;
      }

      _pollTimer?.cancel();
      _navigating = true;

      final dispatchStatus =
          const {
            'NO_DRIVER_FOUND',
            'REFUND_PENDING',
            'REFUNDED',
          }.contains(snapshot.state)
          ? 'NO_DRIVER_FOUND'
          : 'SEARCHING_DRIVER';

      if (dispatchStatus != 'NO_DRIVER_FOUND') {
        setState(() {
          _verified = true;
          _statusMessage = 'Pagamento confirmado. Seu motorista será liberado.';
        });
        if (!MediaQuery.disableAnimationsOf(context)) {
          await Future<void>.delayed(const Duration(milliseconds: 420));
        }
        if (!mounted) return;
      }

      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => RideTrackingScreen(
            rideId: widget.rideId,
            remainingWalletCents: null,
            paymentMethod: 'pix',
            trackingService: tracking,
            realtimeService: widget.realtimeService,
            routeService: widget.routeService,
            initialDispatchStatus: dispatchStatus,
            networkTilesEnabled: widget.networkTilesEnabled,
          ),
        ),
      );
    } on PassengerRideTrackingException {
      if (!mounted) return;
      setState(() {
        _statusMessage = _reservationExpired
            ? 'A reserva expirou. Não faça mais este Pix. '
                  'Se você já pagou, o status será atualizado automaticamente.'
            : 'Pix gerado. Estamos aguardando a confirmação do pagamento.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _statusMessage = _reservationExpired
            ? 'A reserva expirou. Não faça mais este Pix. '
                  'Se você já pagou, o status será atualizado automaticamente.'
            : 'Pix gerado. A confirmação será atualizada automaticamente.';
      });
    } finally {
      _checking = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final qrBytes = _qrBytes;
    final hasCopyCode = widget.result.qrCode.trim().isNotEmpty;
    final reservationExpired = _reservationExpired;

    return Scaffold(
      appBar: AppBar(title: const Text('Pagar com Pix')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(RamoSpacing.xl),
          children: [
            Text(
              'Pagar ${widget.amountLabel}',
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: RamoSpacing.sm),
            Text(
              widget.driverReserved
                  ? 'Seu motorista está reservado e será liberado após a confirmação do pagamento.'
                  : 'A corrida só será enviada ao motorista depois da confirmação.',
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: RamoSpacing.md),
            Text(
              reservationExpired
                  ? 'Reserva expirada · não faça mais este Pix'
                  : 'Reserva do motorista: $_reservationCountdown',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                color: reservationExpired
                    ? Theme.of(context).colorScheme.error
                    : null,
              ),
            ),
            const SizedBox(height: RamoSpacing.lg),
            if (!reservationExpired && qrBytes != null)
              Center(
                child: Container(
                  padding: const EdgeInsets.all(RamoSpacing.md),
                  color: Colors.white,
                  child: RamoReveal(
                    child: Image.memory(
                      qrBytes,
                      width: 260,
                      height: 260,
                      fit: BoxFit.contain,
                      gaplessPlayback: true,
                    ),
                  ),
                ),
              )
            else if (!reservationExpired)
              const Center(child: Icon(Icons.pix_rounded, size: 96))
            else
              Center(
                child: Icon(
                  Icons.timer_off_rounded,
                  size: 96,
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
            const SizedBox(height: RamoSpacing.lg),
            if (!reservationExpired && hasCopyCode)
              FilledButton.icon(
                onPressed: _copyPix,
                icon: Icon(_copied ? Icons.check_rounded : Icons.copy_rounded),
                label: AnimatedSwitcher(
                  duration: MediaQuery.disableAnimationsOf(context)
                      ? Duration.zero
                      : const Duration(milliseconds: 200),
                  child: Text(
                    _copied ? 'Código copiado ✓' : 'Copiar código Pix',
                    key: ValueKey(_copied),
                  ),
                ),
              ),
            const SizedBox(height: RamoSpacing.md),
            Container(
              padding: const EdgeInsets.all(RamoSpacing.md),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(RamoRadius.md),
              ),
              child: Row(
                children: [
                  if (_verified)
                    const RamoSuccessMark(size: 28)
                  else if (reservationExpired ||
                      _statusMessage.startsWith('Pagamento não aprovado'))
                    const Icon(Icons.info_outline_rounded)
                  else
                    const SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  const SizedBox(width: RamoSpacing.sm),
                  Expanded(child: Text(_statusMessage)),
                ],
              ),
            ),
            if (widget.trackingService != null) ...[
              const SizedBox(height: RamoSpacing.sm),
              TextButton.icon(
                onPressed: _checking ? null : _checkStatus,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Atualizar confirmação'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CardPaymentStatusScreen extends StatefulWidget {
  const _CardPaymentStatusScreen({
    required this.rideId,
    required this.result,
    required this.trackingService,
    required this.realtimeService,
    required this.routeService,
    required this.networkTilesEnabled,
  });

  final String rideId;
  final CardRidePaymentResult result;
  final PassengerRideTrackingService? trackingService;
  final PassengerRideRealtimeService? realtimeService;
  final RouteService? routeService;
  final bool networkTilesEnabled;

  @override
  State<_CardPaymentStatusScreen> createState() =>
      _CardPaymentStatusScreenState();
}

class _CardPaymentStatusScreenState extends State<_CardPaymentStatusScreen> {
  Timer? _pollTimer;
  bool _verified = false;
  bool _checking = false;
  bool _navigating = false;
  bool _openingChallenge = false;
  String? _error;
  late String _statusMessage;

  @override
  void initState() {
    super.initState();
    _statusMessage = (_verified || widget.result.paymentConfirmed)
        ? 'Pagamento confirmado.'
        : widget.result.challengeUrl != null
        ? 'Confirme a compra com seu banco para continuar.'
        : 'Estamos confirmando seu pagamento…';

    if (widget.trackingService != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _checkStatus());
      _pollTimer = Timer.periodic(
        const Duration(seconds: 2),
        (_) => _checkStatus(),
      );
    }

    if (widget.result.challengeUrl != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openChallenge());
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _openChallenge() async {
    final raw = widget.result.challengeUrl;
    if (raw == null || _openingChallenge || !mounted) return;

    final uri = Uri.tryParse(raw);
    if (uri == null || uri.scheme != 'https') {
      setState(() {
        _error = 'Não conseguimos abrir a confirmação do banco.';
      });
      return;
    }

    setState(() {
      _openingChallenge = true;
      _error = null;
    });

    try {
      var launched = await launchUrl(uri, mode: LaunchMode.inAppBrowserView);
      if (!launched) {
        launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
      if (!launched && mounted) {
        setState(() {
          _error = 'Não conseguimos abrir a confirmação do banco.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Não conseguimos abrir a confirmação do banco.';
        });
      }
    } finally {
      if (mounted) {
        setState(() => _openingChallenge = false);
      }
    }
  }

  Future<void> _checkStatus() async {
    final tracking = widget.trackingService;
    if (tracking == null || _checking || _navigating || !mounted) return;

    _checking = true;
    try {
      final snapshot = await tracking.tracking(widget.rideId);
      if (!mounted) return;

      if (snapshot.state == 'PAYMENT_FAILED') {
        _pollTimer?.cancel();
        setState(() {
          _statusMessage =
              'Pagamento não aprovado. Você pode voltar e tentar novamente.';
        });
        return;
      }

      const confirmedStates = {
        'PAID',
        'SEARCHING_DRIVER',
        'DRIVER_ASSIGNED',
        'DRIVER_ARRIVING',
        'DRIVER_ARRIVED',
        'IN_PROGRESS',
        'COMPLETED',
        'NO_DRIVER_FOUND',
        'REFUND_PENDING',
        'REFUNDED',
      };

      if (!confirmedStates.contains(snapshot.state)) {
        setState(() {
          _statusMessage = widget.result.challengeUrl != null
              ? 'Aguardando a confirmação do seu banco…'
              : 'Estamos confirmando seu pagamento…';
        });
        return;
      }

      _pollTimer?.cancel();
      _navigating = true;
      final dispatchStatus =
          const {
            'NO_DRIVER_FOUND',
            'REFUND_PENDING',
            'REFUNDED',
          }.contains(snapshot.state)
          ? 'NO_DRIVER_FOUND'
          : 'SEARCHING_DRIVER';

      if (dispatchStatus != 'NO_DRIVER_FOUND') {
        setState(() {
          _verified = true;
          _statusMessage = 'Pagamento confirmado. Seu motorista será liberado.';
        });
        if (!MediaQuery.disableAnimationsOf(context)) {
          await Future<void>.delayed(const Duration(milliseconds: 420));
        }
        if (!mounted) return;
      }

      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => RideTrackingScreen(
            rideId: widget.rideId,
            remainingWalletCents: null,
            paymentMethod: 'card',
            trackingService: tracking,
            realtimeService: widget.realtimeService,
            routeService: widget.routeService,
            initialDispatchStatus: dispatchStatus,
            networkTilesEnabled: widget.networkTilesEnabled,
          ),
        ),
      );
    } on PassengerRideTrackingException {
      if (mounted) {
        setState(() {
          _statusMessage =
              'Pagamento enviado. A confirmação será atualizada automaticamente.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _statusMessage =
              'Pagamento enviado. A confirmação será atualizada automaticamente.';
        });
      }
    } finally {
      _checking = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final challenge = widget.result.challengeUrl != null;
    final failed = _statusMessage.startsWith('Pagamento não aprovado');

    return Scaffold(
      appBar: AppBar(title: const Text('Pagamento com cartão')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RamoSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AnimatedSwitcher(
                duration: MediaQuery.disableAnimationsOf(context)
                    ? Duration.zero
                    : const Duration(milliseconds: 320),
                child: !failed && (_verified || widget.result.paymentConfirmed)
                    ? const RamoSuccessMark(size: 82)
                    : Icon(
                        failed
                            ? Icons.error_rounded
                            : (_verified || widget.result.paymentConfirmed)
                            ? Icons.check_circle_rounded
                            : challenge
                            ? Icons.verified_user_rounded
                            : Icons.credit_card_rounded,
                        key: ValueKey(
                          '$failed-${(_verified || widget.result.paymentConfirmed)}',
                        ),
                        size: 82,
                        color: failed
                            ? Theme.of(context).colorScheme.error
                            : RamoColors.brandYellow,
                      ),
              ),
              const SizedBox(height: RamoSpacing.lg),
              Text(
                failed
                    ? 'Cartão não aprovado'
                    : (_verified || widget.result.paymentConfirmed)
                    ? 'Pagamento confirmado'
                    : challenge
                    ? 'Confirmação do banco'
                    : 'Confirmando pagamento',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: RamoSpacing.sm),
              Text(
                _statusMessage,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              if (!failed &&
                  !(_verified || widget.result.paymentConfirmed)) ...[
                const SizedBox(height: RamoSpacing.lg),
                const Center(
                  child: SizedBox.square(
                    dimension: 28,
                    child: CircularProgressIndicator(strokeWidth: 3),
                  ),
                ),
              ],
              if (challenge) ...[
                const SizedBox(height: RamoSpacing.xl),
                FilledButton.icon(
                  onPressed: _openingChallenge ? null : _openChallenge,
                  icon: const Icon(Icons.security_rounded),
                  label: Text(
                    _openingChallenge
                        ? 'Abrindo banco…'
                        : 'Confirmar com meu banco',
                  ),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: RamoSpacing.md),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
              if (widget.trackingService != null) ...[
                const SizedBox(height: RamoSpacing.sm),
                TextButton.icon(
                  onPressed: _checking ? null : _checkStatus,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Atualizar status'),
                ),
              ],
              const SizedBox(height: RamoSpacing.md),
              Text(
                'Os dados do cartão são protegidos e tokenizados pelo '
                'Mercado Pago. O Ramo Nessa não recebe número completo ou CVV.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CashAuthorizedScreen extends StatelessWidget {
  const _CashAuthorizedScreen({required this.amountCents, this.dispatchStatus});

  final int amountCents;
  final String? dispatchStatus;

  @override
  Widget build(BuildContext context) {
    final dispatchMessage = switch (dispatchStatus) {
      'SEARCHING_DRIVER' => 'Sua corrida já foi enviada ao motorista.',
      'PENDING_RETRY' =>
        'Estamos tentando encontrar outro motorista para você.',
      _ => 'Sua corrida foi liberada e estamos procurando um motorista.',
    };

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RamoSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.payments_rounded,
                size: 82,
                color: RamoColors.signal,
              ),
              const SizedBox(height: RamoSpacing.lg),
              Text(
                'Pagamento em dinheiro',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: RamoSpacing.sm),
              Text(
                'Pague ${PreparedRide.formatCents(amountCents)} '
                'diretamente ao motorista no fim da corrida.',
                style: Theme.of(context).textTheme.bodyLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: RamoSpacing.xs),
              Text(
                dispatchMessage,
                style: Theme.of(context).textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: RamoSpacing.xl),
              FilledButton(
                onPressed: () =>
                    Navigator.of(context).popUntil((route) => route.isFirst),
                child: const Text('Voltar ao início'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaymentConfirmedScreen extends StatelessWidget {
  const _PaymentConfirmedScreen({
    required this.remainingWalletCents,
    this.dispatchStatus,
  });

  final int remainingWalletCents;
  final String? dispatchStatus;

  String get _dispatchMessage => switch (dispatchStatus) {
    'SEARCHING_DRIVER' =>
      'Pagamento confirmado. A corrida já foi enviada ao motorista.',
    'NO_DRIVER_FOUND' =>
      'Pagamento confirmado. Não encontramos motorista nesta rodada.',
    'PENDING_RETRY' =>
      'Pagamento confirmado. Estamos tentando encontrar outro motorista para você.',
    _ =>
      'Pagamento confirmado. Estamos procurando um motorista para sua corrida.',
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RamoSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.check_circle_rounded,
                size: 82,
                color: RamoColors.signal,
              ),
              const SizedBox(height: RamoSpacing.lg),
              Text(
                'Pagamento confirmado',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: RamoSpacing.sm),
              Text(
                _dispatchMessage,
                style: Theme.of(context).textTheme.bodyLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: RamoSpacing.sm),
              Text(
                'Saldo restante: '
                '${PreparedRide.formatCents(remainingWalletCents)}',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: RamoSpacing.xl),
              FilledButton(
                onPressed: () =>
                    Navigator.of(context).popUntil((route) => route.isFirst),
                child: const Text('Voltar ao início'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({required this.label, required this.cents});

  final String label;
  final int cents;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: RamoSpacing.xs),
      child: Row(
        children: [
          Expanded(child: Text(label)),
          Text(
            PreparedRide.formatCents(cents),
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class _PaymentOption extends StatelessWidget {
  const _PaymentOption({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.enabled,
    required this.onTap,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool enabled;
  final VoidCallback onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return AnimatedOpacity(
      duration: RamoMotion.standard,
      opacity: enabled ? 1 : .48,
      child: Material(
        color: RamoColors.surfaceRaised,
        borderRadius: BorderRadius.circular(RamoRadius.lg),
        child: InkWell(
          borderRadius: BorderRadius.circular(RamoRadius.lg),
          onTap: enabled ? onTap : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: RamoSpacing.md,
              vertical: 13,
            ),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(
                    icon,
                    size: 22,
                    color: enabled
                        ? RamoColors.brandBlack
                        : scheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(width: RamoSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.35,
                            ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: RamoColors.muted,
                          height: 1.24,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: RamoSpacing.sm),
                AnimatedSwitcher(
                  duration: RamoMotion.standard,
                  child:
                      trailing ??
                      Icon(
                        Icons.chevron_right_rounded,
                        key: ValueKey(enabled),
                        size: 23,
                        color: enabled
                            ? RamoColors.brandBlack
                            : scheme.onSurfaceVariant,
                      ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
