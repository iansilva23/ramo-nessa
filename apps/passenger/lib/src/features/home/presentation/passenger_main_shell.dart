import 'package:flutter/material.dart';

import '../../../core/auth/phone_auth_service.dart';
import '../../profile/presentation/passenger_profile_screen.dart';
import '../../rides/data/passenger_activity_service.dart';
import '../../rides/presentation/passenger_activity_screen.dart';

class PassengerMainShell extends StatefulWidget {
  const PassengerMainShell({
    super.key,
    required this.homeBuilder,
    required this.activityService,
    required this.authService,
    required this.accessToken,
    this.onLogout,
    this.previewMode = false,
  });

  final Widget Function(VoidCallback openProfile) homeBuilder;
  final PassengerActivityService? activityService;
  final PhoneAuthService? authService;
  final String? accessToken;
  final Future<bool> Function()? onLogout;
  final bool previewMode;

  @override
  State<PassengerMainShell> createState() => _PassengerMainShellState();
}

class _PassengerMainShellState extends State<PassengerMainShell> {
  int _index = 0;

  void _select(int index) {
    setState(() => _index = index);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: [
          widget.homeBuilder(() => _select(2)),
          PassengerActivityScreen(service: widget.activityService),
          PassengerProfileScreen(
            authService: widget.authService,
            accessToken: widget.accessToken,
            onOpenActivity: () => _select(1),
            onLogout: widget.onLogout,
            previewMode: widget.previewMode,
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
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
    );
  }
}
