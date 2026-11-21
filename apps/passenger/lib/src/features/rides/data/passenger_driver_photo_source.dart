import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';

abstract interface class PassengerDriverPhotoSource {
  Future<Uint8List?> driverPortrait(String rideId, String driverId);
}

Future<Uint8List?> fetchPassengerDriverPortrait({
  required http.Client client,
  required Uri baseUrl,
  required Map<String, String> headers,
  required String rideId,
  required String driverId,
}) async {
  final uri = baseUrl
      .resolve('/v1/rides/${Uri.encodeComponent(rideId)}/driver-portrait')
      .replace(queryParameters: {'driver': driverId});
  final response = await client
      .get(uri, headers: headers)
      .timeout(RamoCoreConfig.requestTimeout);
  if (response.statusCode != 200 ||
      response.headers['content-type'] != 'image/jpeg') {
    return null;
  }
  return response.bodyBytes;
}
