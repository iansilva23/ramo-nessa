import '../../rides/domain/passenger_activity.dart';
import 'package:flutter/foundation.dart';

import '../../guide/data/local_guide_service.dart';
import '../../guide/presentation/local_guide_screen.dart';
import '../../map/domain/ramo_place.dart';

import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/auth/phone_auth_service.dart';
import '../../../core/communications/social_links_service.dart';
import '../../payments/data/passenger_payment_service.dart';
import '../../map/data/place_search_service.dart';
import '../../profile/data/passenger_privacy_service.dart';
import '../../profile/data/passenger_saved_place_service.dart';
import '../../profile/data/passenger_support_service.dart';
import '../../profile/presentation/passenger_profile_screen.dart';
import '../../rides/data/passenger_activity_service.dart';
import '../../rides/presentation/passenger_activity_screen.dart';
import '../../tours/data/agency_tour_service.dart';
import '../../tours/presentation/agency_tours_screen.dart';

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
    required this.tourService,
    this.guideService,
    this.onResumeRide,
    this.supportService,
    this.privacyService,
    this.socialLinksService,
    this.onLogout,
    this.previewMode = false,
  });

  final Widget Function(
    VoidCallback openProfile,
    VoidCallback openGuide,
    ValueListenable<RamoPlace?> destination,
  )
  homeBuilder;
  final Future<void> Function(BuildContext context, PassengerActivityRide ride)?
  onResumeRide;
  final PassengerActivityService? activityService;
  final PhoneAuthService? authService;
  final PassengerPaymentService? paymentService;
  final PassengerSavedPlaceService? savedPlaceService;
  final PlaceSearchService? placeSearchService;
  final SocialLinksService? socialLinksService;
  final AgencyTourService tourService;
  final LocalGuideService? guideService;
  final PassengerSupportService? supportService;
  final PassengerPrivacyService? privacyService;
  final String? accessToken;
  final Future<bool> Function()? onLogout;
  final bool previewMode;

  @override
  State<PassengerMainShell> createState() => _PassengerMainShellState();
}

class _PassengerMainShellState extends State<PassengerMainShell> {
  int _index = 0;
  final ValueNotifier<RamoPlace?> _guideDestination = ValueNotifier(null);

  @override
  void dispose() {
    _guideDestination.dispose();
    super.dispose();
  }

  void _select(int index) {
    if (index == _index) return;
    setState(() => _index = index);
  }

  Widget _animatedTabs(List<Widget> pages) {
    return Stack(
      fit: StackFit.expand,
      children: List.generate(pages.length, (index) {
        final selected = index == _index;
        final horizontalOffset = selected
            ? 0.0
            : (index < _index ? -0.025 : 0.025);

        return Offstage(
          offstage: !selected,
          child: IgnorePointer(
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
                icon: Icon(Icons.explore_outlined),
                selectedIcon: Icon(Icons.explore_rounded),
                label: 'Guia Local',
              ),
              NavigationDestination(
                icon: Icon(Icons.receipt_long_outlined),
                selectedIcon: Icon(Icons.receipt_long_rounded),
                label: 'Atividades',
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
      widget.homeBuilder(() => _select(3), () => _select(1), _guideDestination),
      widget.guideService == null
          ? AgencyToursScreen(service: widget.tourService)
          : LocalGuideScreen(
              service: widget.guideService!,
              places: widget.placeSearchService,
              onDestination: (destination) {
                _select(0);
                _guideDestination.value = destination;
              },
            ),
      PassengerActivityScreen(
        service: widget.activityService,
        visible: _index == 2,
        onResume: widget.onResumeRide == null
            ? null
            : (ride) => widget.onResumeRide!(context, ride),
        support: widget.supportService is RamoRideSupportApi
            ? widget.supportService as RamoRideSupportApi
            : null,
      ),
      PassengerProfileScreen(
        authService: widget.authService,
        accessToken: widget.accessToken,
        onOpenActivity: () => _select(2),
        activityService: widget.activityService,
        paymentService: widget.paymentService,
        savedPlaceService: widget.savedPlaceService,
        placeSearchService: widget.placeSearchService,
        socialLinksService: widget.socialLinksService,
        supportService: widget.supportService,
        privacyService: widget.privacyService,
        onLogout: widget.onLogout,
        previewMode: widget.previewMode,
      ),
    ];

    final guideNavigationTheme = ThemeData.dark(useMaterial3: true).copyWith(
      colorScheme: const ColorScheme.dark(
        surface: Color(0xFF111419),
        primary: RamoColors.brandYellow,
      ),
      navigationBarTheme: NavigationBarThemeData(
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected)
                ? Colors.black
                : const Color(0xFFB9BDC5),
          ),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 12,
            color: states.contains(WidgetState.selected)
                ? RamoColors.brandYellow
                : const Color(0xFFB9BDC5),
          ),
        ),
      ),
    );
    return Scaffold(
      backgroundColor: _index == 1 ? const Color(0xFF090B0E) : null,
      body: _animatedTabs(pages),
      bottomNavigationBar: _index == 1
          ? Theme(
              data: guideNavigationTheme,
              child: Builder(builder: _premiumBottomNavigation),
            )
          : _premiumBottomNavigation(context),
    );
  }
}
