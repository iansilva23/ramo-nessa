import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/home/domain/service_type.dart';

void main() {
  test('serviços principais têm labels, descrições e preços provisórios', () {
    expect(ServiceType.values, hasLength(3));

    expect(ServiceType.car.label, 'Carro');
    expect(ServiceType.moto.label, 'Moto');
    expect(ServiceType.delivery.label, 'Entrega');

    for (final service in ServiceType.values) {
      expect(service.previewPrice, startsWith('R\$ '));
      expect(service.description, isNotEmpty);
    }
  });
}
