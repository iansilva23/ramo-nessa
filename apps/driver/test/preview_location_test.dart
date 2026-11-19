import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/core/location/device_driver_location_service.dart';
import 'package:ramo_nessa_driver/src/core/location/driver_location_service.dart';
import 'package:ramo_nessa_driver/src/preview/driver_preview_dependencies.dart';

void main() {
  test('Preview usa GPS do aparelho sem percurso automático simulado', () {
    expect(DriverPreviewDependencies().location,
        isA<DeviceDriverLocationService>());
  });

  test('GPS real atualiza supply sem trocar a corrida demonstrativa', () async {
    final api = DriverPreviewDependencies().api;
    final offer = await api.currentOffer();
    expect(offer, isNotNull);
    final ride = await api.acceptOffer(offer!.id);
    const position = DriverPosition(latitude: -2.7979, longitude: -40.5151);
    final supply = await api.updateSupply(position: position);
    expect(supply.latitude, position.latitude);
    expect(supply.longitude, position.longitude);
    expect(supply.busy, isTrue);
    expect(await api.currentOffer(), isNull);
    final arrived = await api.markArrived(ride.id);
    expect(arrived.id, ride.id);
    expect(arrived.state, 'DRIVER_ARRIVED');
    expect((await api.getSupply()).latitude, position.latitude);
    expect(await api.currentOffer(), isNull);
  });
}
