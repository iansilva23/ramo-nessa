import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import 'features/home/presentation/passenger_home_screen.dart';

class RamoNessaPassengerApp extends StatelessWidget {
  const RamoNessaPassengerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ramo Nessa',
      debugShowCheckedModeBanner: false,
      theme: RamoTheme.light,
      darkTheme: RamoTheme.dark,
      themeMode: ThemeMode.system,
      home: const PassengerHomeScreen(),
    );
  }
}
