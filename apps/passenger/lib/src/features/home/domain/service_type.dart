import 'package:flutter/material.dart';

enum ServiceType {
  car,
  moto,
  delivery,
  comfortBlack,
  buggy,
}

extension ServiceTypeUi on ServiceType {
  String get label => switch (this) {
        ServiceType.car => 'Carro',
        ServiceType.moto => 'Moto',
        ServiceType.delivery => 'Entrega',
        ServiceType.comfortBlack => 'Comfort',
        ServiceType.buggy => 'Buggy',
      };

  String get description => switch (this) {
        ServiceType.car => 'Carro popular',
        ServiceType.moto => 'Mais rápido',
        ServiceType.delivery => 'Envie algo',
        ServiceType.comfortBlack => '4x4 premium',
        ServiceType.buggy => 'Até 4 pessoas',
      };

  String get backendKey => switch (this) {
        ServiceType.car => 'car',
        ServiceType.moto => 'moto',
        ServiceType.delivery => 'delivery',
        ServiceType.comfortBlack => 'comfort_black',
        ServiceType.buggy => 'buggy',
      };

  IconData get icon => switch (this) {
        ServiceType.car => Icons.directions_car_filled_rounded,
        ServiceType.moto => Icons.two_wheeler_rounded,
        ServiceType.delivery => Icons.inventory_2_rounded,
        ServiceType.comfortBlack => Icons.airport_shuttle_rounded,
        ServiceType.buggy => Icons.directions_car_rounded,
      };
}
