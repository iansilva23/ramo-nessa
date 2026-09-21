import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'core/location/location_service.dart';
import 'features/home/presentation/passenger_home_screen.dart';
import 'features/map/data/place_search_service.dart';
import 'features/map/data/route_service.dart';

class RamoNessaPassengerApp extends StatelessWidget {
  const RamoNessaPassengerApp({
    super.key,
    this.locationService,
    this.routeService,
    this.placeSearchService,
    this.networkTilesEnabled = true,
  });

  final LocationService? locationService;
  final RouteService? routeService;
  final PlaceSearchService? placeSearchService;
  final bool networkTilesEnabled;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ramo Nessa',
      debugShowCheckedModeBanner: false,
      theme: RamoTheme.light,
      darkTheme: RamoTheme.dark,
      themeMode: ThemeMode.system,
      home: PassengerHomeScreen(
        locationService: locationService,
        routeService: routeService,
        placeSearchService: placeSearchService,
        networkTilesEnabled: networkTilesEnabled,
      ),
    );
  }
}
