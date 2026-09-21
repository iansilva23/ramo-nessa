import 'package:flutter/material.dart';

enum ServiceType {
  car,
  moto,
  delivery,
}

extension ServiceTypeUi on ServiceType {
  String get label => switch (this) {
        ServiceType.car => 'Carro',
        ServiceType.moto => 'Moto',
        ServiceType.delivery => 'Entrega',
      };

  String get description => switch (this) {
        ServiceType.car => 'Mais conforto',
        ServiceType.moto => 'Mais rápido',
        ServiceType.delivery => 'Envie algo',
      };

  IconData get icon => switch (this) {
        ServiceType.car => Icons.directions_car_filled_rounded,
        ServiceType.moto => Icons.two_wheeler_rounded,
        ServiceType.delivery => Icons.inventory_2_rounded,
      };

  String get previewEta => switch (this) {
        ServiceType.car => '4 min',
        ServiceType.moto => '3 min',
        ServiceType.delivery => '5 min',
      };

  String get previewPrice => switch (this) {
        ServiceType.car => 'R\$ 32,80',
        ServiceType.moto => 'R\$ 18,40',
        ServiceType.delivery => 'R\$ 22,90',
      };
}
