import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

import '../../../core/communications/firebase_push_registration_service.dart';

class DriverNotificationsScreen extends StatelessWidget {
  const DriverNotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final push = DriverFirebasePushRegistrationService.instance;
    return RamoNotificationSettings(
      readPreference: push.readAllNotifications,
      savePreference: push.setAllNotifications,
      requestNotifications: push.requestNotifications,
      notificationHelp: push.notificationHelp,
    );
  }
}
