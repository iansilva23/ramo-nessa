import 'features/payments/data/http_passenger_payment_service.dart';
import 'features/payments/data/passenger_payment_service.dart';
import 'features/profile/data/http_passenger_saved_place_service.dart';
import 'features/profile/data/http_passenger_support_service.dart';
import 'features/profile/data/passenger_saved_place_service.dart';
import 'features/profile/data/passenger_support_service.dart';
import 'features/rides/data/http_passenger_activity_service.dart';
import 'features/rides/data/passenger_activity_service.dart';
import 'preview/passenger_preview_dependencies.dart';

/// One selection for the home and profile. Preview tokens must never select
/// private Core endpoints, even when a public Maps Core URL is configured.
class PassengerSessionServices {
  PassengerSessionServices({
    required Uri? coreUri,
    required String? accessToken,
    PassengerPreviewDependencies? preview,
    PassengerPaymentService? paymentService,
  }) {
    final token = accessToken?.trim();
    final authenticated = coreUri != null &&
        token != null &&
        token.length >= 20;

    if (preview != null) {
      payments = paymentService ?? preview.payments;
      activity = preview.activity;
      support = preview.support;
      savedPlaces = null;
    } else if (authenticated) {
      payments = paymentService ??
          HttpPassengerPaymentService(baseUrl: coreUri, accessToken: token);
      activity =
          HttpPassengerActivityService(baseUrl: coreUri, accessToken: token);
      support =
          HttpPassengerSupportService(baseUrl: coreUri, accessToken: token);
      savedPlaces =
          HttpPassengerSavedPlaceService(baseUrl: coreUri, accessToken: token);
    } else {
      payments = paymentService;
      activity = null;
      support = null;
      savedPlaces = null;
    }
  }

  late final PassengerPaymentService? payments;
  late final PassengerActivityService? activity;
  late final PassengerSupportService? support;
  late final PassengerSavedPlaceService? savedPlaces;
}
