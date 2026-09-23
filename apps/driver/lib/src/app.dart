import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'core/location/driver_location_service.dart';
import 'core/navigation/driver_navigation_service.dart';
import 'features/home/data/driver_api.dart';
import 'features/home/data/driver_realtime_service.dart';
import 'features/home/presentation/driver_home_screen.dart';

class RamoNessaDriverApp extends StatelessWidget {
  const RamoNessaDriverApp({
    super.key,
    this.api,
    this.locationService,
    this.navigationService,
    this.realtimeService,
  });

  final DriverApi? api;
  final DriverLocationService? locationService;
  final DriverNavigationService? navigationService;
  final DriverRealtimeService? realtimeService;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ramo Nessa Motorista',
      debugShowCheckedModeBanner: false,
      theme: RamoTheme.light,
      darkTheme: RamoTheme.dark,
      themeMode: ThemeMode.system,
      home: DriverHomeScreen(
        api: api,
        locationService: locationService,
        navigationService: navigationService,
        realtimeService: realtimeService,
      ),
    );
  }
}
