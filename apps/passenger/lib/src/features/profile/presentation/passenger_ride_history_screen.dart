import 'package:flutter/material.dart';

import '../../rides/data/passenger_activity_service.dart';
import '../../rides/presentation/passenger_activity_screen.dart';

class PassengerRideHistoryScreen extends StatelessWidget {
  const PassengerRideHistoryScreen({
    super.key,
    required this.service,
  });

  final PassengerActivityService? service;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Histórico de corridas')),
      body: PassengerActivityScreen(service: service),
    );
  }
}
