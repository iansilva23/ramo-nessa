import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';

void main() {
  test('serviços comerciais têm labels e chaves do Core', () {
    expect(ServiceType.values, hasLength(5));

    expect(ServiceType.car.backendKey, 'car');
    expect(ServiceType.moto.backendKey, 'moto');
    expect(ServiceType.delivery.backendKey, 'delivery');
    expect(ServiceType.comfortBlack.backendKey, 'comfort_black');
    expect(ServiceType.buggy.backendKey, 'buggy');

    for (final service in ServiceType.values) {
      expect(service.label, isNotEmpty);
      expect(service.description, isNotEmpty);
    }
  });
}
