import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/core/location/location_service.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/passenger_home_screen.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/widgets/ramo_live_map.dart';

void main() {
  testWidgets('minha localização lê GPS novo e preserva coordenadas no mapa',
      (tester) async {
    final location = _DeviceLocationFixture();
    await tester.pumpWidget(MaterialApp(
      home: PassengerHomeScreen(
        locationService: location,
        networkTilesEnabled: false,
      ),
    ));
    await tester.pumpAndSettle();
    expect(location.calls, 1);
    expect(tester.widget<RamoLiveMap>(find.byType(RamoLiveMap))
        .origin?.position, location.position);

    location.position = const LatLng(-2.7979, -40.5151);
    await tester.tap(find.byTooltip('Usar minha localização'));
    await tester.pumpAndSettle();
    expect(location.calls, 2);
    expect(tester.widget<RamoLiveMap>(find.byType(RamoLiveMap))
        .origin?.position, location.position);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('falha do GPS mostra erro sem inventar embarque', (tester) async {
    final location = _DeviceLocationFixture()
      ..error = const LocationServiceException('Ative a localização do celular.');
    await tester.pumpWidget(MaterialApp(
      home: PassengerHomeScreen(
        locationService: location,
        networkTilesEnabled: false,
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Ative a localização do celular.'), findsOneWidget);
    expect(tester.widget<RamoLiveMap>(find.byType(RamoLiveMap)).origin, isNull);

    location.error = null;
    await tester.tap(find.byTooltip('Usar minha localização'));
    await tester.pumpAndSettle();
    expect(location.calls, 2);
    expect(tester.widget<RamoLiveMap>(find.byType(RamoLiveMap))
        .origin?.position, location.position);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

class _DeviceLocationFixture implements LocationService {
  LatLng position = const LatLng(-2.7961, -40.5161);
  LocationServiceException? error;
  int calls = 0;

  @override
  Future<LatLng> getCurrentLocation() async {
    calls++;
    final failure = error;
    if (failure != null) throw failure;
    return position;
  }
}
