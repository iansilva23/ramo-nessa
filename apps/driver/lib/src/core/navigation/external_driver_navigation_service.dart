import 'package:url_launcher/url_launcher.dart';

import 'driver_navigation_service.dart';

class ExternalDriverNavigationService implements DriverNavigationService {
  @override
  Future<void> openNavigation({
    required double latitude,
    required double longitude,
  }) async {
    if (
      !latitude.isFinite ||
      latitude < -90 ||
      latitude > 90 ||
      !longitude.isFinite ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw const DriverNavigationException(
        'Destino de navegação inválido.',
      );
    }

    final destination = '$latitude,$longitude';
    final uri = Uri.https(
      'www.google.com',
      '/maps/dir/',
      {
        'api': '1',
        'destination': destination,
        'travelmode': 'driving',
      },
    );

    final opened = await launchUrl(
      uri,
      mode: LaunchMode.externalApplication,
    );

    if (!opened) {
      throw const DriverNavigationException(
        'Não foi possível abrir o aplicativo de navegação.',
      );
    }
  }
}
