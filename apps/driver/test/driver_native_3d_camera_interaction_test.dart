import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_driver/src/features/home/presentation/widgets/driver_live_map.dart';

void main() {
  const firstPoint = LatLng(-2.7956, -40.5142);
  const secondPoint = LatLng(-2.7956, -40.5140);

  test('programmatic map camera movement does not pause native GPS follow', () async {
    final controller = DriverMapController();
    addTearDown(controller.dispose);

    await controller.followNavigation(firstPoint);
    controller.onCameraMoveStarted(); // Native SDK animation without a touch.
    expect(controller.followPaused.value, isFalse);
  });

  test('manual map gesture pauses tracking until the recenter action', () async {
    final controller = DriverMapController();
    addTearDown(controller.dispose);

    await controller.followNavigation(firstPoint);
    controller.onMapPointerDown();
    controller.onCameraMoveStarted();
    expect(controller.followPaused.value, isTrue);

    controller.onMapPointerUp();
    await controller.followNavigation(secondPoint);
    expect(controller.followPaused.value, isTrue,
        reason: 'Location changes must not pull the map back');

    controller.resumeNativeFollow();
    expect(controller.followPaused.value, isFalse);
    await controller.followNavigation(secondPoint);
    expect(controller.followPaused.value, isFalse);
  });

  test('finishing GPS 3D clears manual-follow state and restores normal mode',
      () async {
    final controller = DriverMapController();
    addTearDown(controller.dispose);

    await controller.followNavigation(firstPoint);
    controller.onMapPointerDown();
    controller.onCameraMoveStarted();
    expect(controller.followPaused.value, isTrue);
    controller.onMapPointerUp();

    await controller.stopNativeNavigation(firstPoint);
    expect(controller.followPaused.value, isFalse);

    controller.onMapPointerDown();
    controller.onCameraMoveStarted();
    expect(controller.followPaused.value, isFalse,
        reason: 'No navigation mode means no locked camera');
    controller.onMapPointerUp();
  });
}
