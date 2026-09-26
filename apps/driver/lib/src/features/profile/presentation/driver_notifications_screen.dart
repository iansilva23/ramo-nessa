import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

class DriverNotificationsScreen extends StatelessWidget {
  const DriverNotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notificações')),
      body: ListView(
        padding: const EdgeInsets.all(RamoSpacing.lg),
        children: [
          Container(
            padding: const EdgeInsets.all(RamoSpacing.lg),
            decoration: BoxDecoration(
              color: RamoColors.surfaceRaised,
              borderRadius: BorderRadius.circular(RamoRadius.lg),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.notifications_off_outlined, size: 34),
                SizedBox(height: RamoSpacing.md),
                Text(
                  'Notificações push temporariamente indisponíveis',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
                SizedBox(height: RamoSpacing.sm),
                Text('Um novo provedor de notificações será configurado depois.'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
