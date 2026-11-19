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
      appBar: AppBar(
        toolbarHeight: MediaQuery.textScalerOf(context).scale(1) > 1.2 ? 88 : 64,
        title: const Text('Histórico de corridas', maxLines: 2, softWrap: true),
      ),
      body: PassengerActivityScreen(service: service),
    );
  }
}
