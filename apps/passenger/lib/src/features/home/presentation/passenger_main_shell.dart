import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/auth/phone_auth_service.dart';
import '../../../core/communications/social_links_service.dart';
import '../../payments/data/passenger_payment_service.dart';
import '../../map/data/place_search_service.dart';
import '../../profile/data/passenger_saved_place_service.dart';
import '../../profile/presentation/passenger_profile_screen.dart';
import '../../rides/data/passenger_activity_service.dart';
import '../../rides/presentation/passenger_activity_screen.dart';

class PassengerMainShell extends StatefulWidget {
  const PassengerMainShell({
    super.key,
    required this.homeBuilder,
    required this.activityService,
    required this.authService,
    required this.paymentService,
    required this.savedPlaceService,
    required this.placeSearchService,
    required this.accessToken,
    this.socialLinksService,
    this.onLogout,
    this.previewMode = false,
  });

  final Widget Function(VoidCallback openProfile) homeBuilder;
  final PassengerActivityService? activityService;
  final PhoneAuthService? authService;
  final PassengerPaymentService? paymentService;
  final PassengerSavedPlaceService? savedPlaceService;
  final PlaceSearchService? placeSearchService;
  final SocialLinksService? socialLinksService;
  final String? accessToken;
  final Future<bool> Function()? onLogout;
  final bool previewMode;

  @override
  State<PassengerMainShell> createState() => _PassengerMainShellState();
}

class _PassengerMainShellState extends State<PassengerMainShell> {
  int _index = 0;

  void _select(int index) {
    if (index == _index) return;
    setState(() => _index = index);
  }

  Widget _animatedTabs(List<Widget> pages) {
    return Stack(
      fit: StackFit.expand,
      children: List.generate(pages.length, (index) {
        final selected = index == _index;
        final horizontalOffset =
            selected ? 0.0 : (index < _index ? -0.025 : 0.025);

        return IgnorePointer(
          ignoring: !selected,
          child: ExcludeSemantics(
            excluding: !selected,
            child: TickerMode(
              enabled: selected,
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 230),
                curve: Curves.easeOutCubic,
                opacity: selected ? 1 : 0,
                child: AnimatedSlide(
                  duration: const Duration(milliseconds: 260),
                  curve: Curves.easeOutCubic,
                  offset: Offset(horizontalOffset, 0),
                  child: pages[index],
                ),
              ),
            ),
          ),
        );
      }),
    );
  }

  Widget _premiumBottomNavigation(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(12, 4, 12, 10),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(30),
          border: Border.all(
            color: colors.outlineVariant.withValues(alpha: .55),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: .12),
              blurRadius: 24,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(30),
          child: NavigationBar(
            height: 72,
            backgroundColor: colors.surface.withValues(alpha: .98),
            surfaceTintColor: Colors.transparent,
            indicatorColor: RamoColors.brandYellow,
            indicatorShape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(22),
            ),
            selectedIndex: _index,
            onDestinationSelected: _select,
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.map_outlined),
                selectedIcon: Icon(Icons.map_rounded),
                label: 'Início',
              ),
              NavigationDestination(
                icon: Icon(Icons.receipt_long_outlined),
                selectedIcon: Icon(Icons.receipt_long_rounded),
                label: 'Atividade',
              ),
              NavigationDestination(
                icon: Icon(Icons.person_outline_rounded),
                selectedIcon: Icon(Icons.person_rounded),
                label: 'Perfil',
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      widget.homeBuilder(() => _select(2)),
      PassengerActivityScreen(service: widget.activityService),
      PassengerProfileScreen(
        authService: widget.authService,
        accessToken: widget.accessToken,
        onOpenActivity: () => _select(1),
        activityService: widget.activityService,
        paymentService: widget.paymentService,
        savedPlaceService: widget.savedPlaceService,
        placeSearchService: widget.placeSearchService,
        socialLinksService: widget.socialLinksService,
        onLogout: widget.onLogout,
        previewMode: widget.previewMode,
      ),
    ];

    return Scaffold(
      body: _animatedTabs(pages),
      bottomNavigationBar: _premiumBottomNavigation(context),
    );
  }
}
