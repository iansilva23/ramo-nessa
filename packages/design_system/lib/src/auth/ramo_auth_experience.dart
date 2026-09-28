import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../foundation/ramo_colors.dart';

/// Moldura compartilhada dos fluxos de autenticação dos apps Ramo Nessa.
///
/// Mantém o formulário real e acessível enquanto reproduz a composição do
/// vídeo de referência: imagem ampla, cartão branco arredondado e entrada em
/// camadas. A imagem remota é opcional e sempre possui fallback embarcado.
class RamoAuthScaffold extends StatefulWidget {
  const RamoAuthScaffold({
    super.key,
    required this.child,
    this.heroImageUrl,
  });

  final Widget child;
  final String? heroImageUrl;

  @override
  State<RamoAuthScaffold> createState() => _RamoAuthScaffoldState();
}

class _RamoAuthScaffoldState extends State<RamoAuthScaffold>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 850),
  )..forward();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final media = MediaQuery.of(context);
    final compact = media.size.height < 720 || media.viewInsets.bottom > 0;
    final heroHeight = media.size.height * (compact ? .30 : .42);
    final cardTop = media.size.height * (compact ? .18 : .34);
    final animation = reduceMotion ? const AlwaysStoppedAnimation(1.0) : _controller;
    return Scaffold(
      backgroundColor: Colors.white,
      body: AnimatedBuilder(
        animation: animation,
        builder: (context, _) {
          final value = animation.value;
          final heroT = Curves.easeOutCubic.transform(math.min(1, value * 1.55));
          final cardT = Curves.easeOutCubic.transform(
            ((value - .18) / .82).clamp(0.0, 1.0).toDouble(),
          );
          return Stack(
            children: [
              Positioned.fill(
                bottom: null,
                child: Opacity(
                  opacity: heroT,
                  child: Transform.scale(
                    scale: 1.06 - (.06 * heroT),
                    alignment: Alignment.topCenter,
                    child: SizedBox(
                      height: heroHeight,
                      child: _HeroImage(url: widget.heroImageUrl),
                    ),
                  ),
                ),
              ),
              Positioned.fill(
                top: cardTop,
                child: Transform.translate(
                  offset: Offset(0, 46 * (1 - cardT)),
                  child: Opacity(
                    opacity: cardT,
                    child: Container(
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.vertical(
                          top: Radius.circular(34),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Color(0x1F000000),
                            blurRadius: 28,
                            offset: Offset(0, -5),
                          ),
                        ],
                      ),
                      child: SafeArea(
                        top: false,
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.fromLTRB(28, 30, 28, 36),
                          child: Center(
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 440),
                              child: widget.child,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _HeroImage extends StatelessWidget {
  const _HeroImage({this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    const fallback = Image(
      image: AssetImage(
        'assets/auth/login_hero.webp',
        package: 'ramo_design_system',
      ),
      fit: BoxFit.cover,
      alignment: Alignment.center,
    );
    final source = url?.trim();
    return Stack(
      fit: StackFit.expand,
      children: [
        if (source == null || source.isEmpty)
          fallback
        else
          Image.network(
            source,
            fit: BoxFit.cover,
            alignment: Alignment.center,
            errorBuilder: (_, __, ___) => fallback,
          ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x00000000), Color(0x24000000)],
            ),
          ),
        ),
      ],
    );
  }
}

/// Botão operacional com a animação de veículo percorrendo uma rota durante
/// chamadas remotas. O callback continua sendo a única fonte da ação.
class RamoRouteSubmitButton extends StatefulWidget {
  const RamoRouteSubmitButton({
    super.key,
    required this.label,
    required this.loading,
    required this.onPressed,
  });

  final String label;
  final bool loading;
  final VoidCallback? onPressed;

  @override
  State<RamoRouteSubmitButton> createState() => _RamoRouteSubmitButtonState();
}

class _RamoRouteSubmitButtonState extends State<RamoRouteSubmitButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1250),
  );

  @override
  void initState() {
    super.initState();
    if (widget.loading) _controller.repeat();
  }

  @override
  void didUpdateWidget(covariant RamoRouteSubmitButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.loading && !oldWidget.loading) {
      _controller.repeat();
    } else if (!widget.loading && oldWidget.loading) {
      _controller.stop();
      _controller.value = 0;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: widget.loading ? null : widget.onPressed,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 220),
        child: widget.loading
            ? SizedBox(
                key: const ValueKey('route-loading'),
                height: 26,
                width: 164,
                child: AnimatedBuilder(
                  animation: _controller,
                  builder: (context, _) => CustomPaint(
                    painter: _RouteLoadingPainter(_controller.value),
                  ),
                ),
              )
            : Text(widget.label, key: const ValueKey('route-label')),
      ),
    );
  }
}

class _RouteLoadingPainter extends CustomPainter {
  const _RouteLoadingPainter(this.progress);

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final route = Paint()
      ..color = const Color(0x66FFFFFF)
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    for (double x = 3; x < size.width; x += 12) {
      canvas.drawLine(Offset(x, size.height * .67), Offset(x + 6, size.height * .67), route);
    }
    final x = 9 + ((size.width - 34) * Curves.easeInOut.transform(progress));
    canvas.save();
    canvas.translate(x, size.height * .5);
    final car = Paint()..color = RamoColors.brandYellow;
    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(-10, -6, 22, 11), const Radius.circular(4)),
      car,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(-5, -11, 12, 8), const Radius.circular(3)),
      car,
    );
    final wheel = Paint()..color = RamoColors.brandBlack;
    canvas.drawCircle(const Offset(-5, 6), 2.5, wheel);
    canvas.drawCircle(const Offset(8, 6), 2.5, wheel);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _RouteLoadingPainter oldDelegate) => oldDelegate.progress != progress;
}
