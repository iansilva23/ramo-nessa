abstract final class RamoMapMarkerAssets {
  static const passenger =
      'packages/ramo_design_system/assets/map_markers/passenger.png';

  static const destination =
      'packages/ramo_design_system/assets/map_markers/destination.png';

  static String vehicle(String? category) => switch (category) {
        'comfort_black' =>
          'packages/ramo_design_system/assets/map_markers/comfort.png',
        'moto' =>
          'packages/ramo_design_system/assets/map_markers/motorcycle.png',
        'delivery' =>
          'packages/ramo_design_system/assets/map_markers/delivery.png',
        'buggy' =>
          'packages/ramo_design_system/assets/map_markers/buggy.png',
        _ => 'packages/ramo_design_system/assets/map_markers/car.png',
      };
}
