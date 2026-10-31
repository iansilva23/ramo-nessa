import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gm;
// Locked transitive SDK interface, replaced only in this test.
// ignore: depend_on_referenced_packages
import 'package:google_maps_flutter_platform_interface/google_maps_flutter_platform_interface.dart' as gi;
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/home/data/passenger_nearby_service.dart';
import 'package:ramo_nessa_passenger/src/features/home/presentation/widgets/ramo_live_map.dart';
import 'web_pin_map_lifecycle_test.dart' show LifecycleMapPlatform;

void main() {
  testWidgets('real map uses category bitmaps, interpolates positions and removes departed vehicles',(tester) async {
    final original = gi.GoogleMapsFlutterPlatform.instance;
    gi.GoogleMapsFlutterPlatform.instance = LifecycleMapPlatform();
    final controller = RamoMapController();
    addTearDown(() async { await tester.pumpWidget(const SizedBox.shrink()); controller.dispose(); gi.GoogleMapsFlutterPlatform.instance = original; });
    Widget screen(List<PassengerNearbyVehicle> vehicles) => MaterialApp(home:RamoLiveMap(controller:controller,origin:null,destination:null,routePoints:const [],nearbyVehicles:vehicles));
    final initial = ['moto','car','buggy','delivery','comfort_black'].asMap().entries.map((e)=>PassengerNearbyVehicle(id:'vehicle-${e.key}',category:e.value,position:LatLng(-2.82+e.key*.001,-40.41))).toList();
    await tester.pumpWidget(screen(initial));await tester.pumpAndSettle();
    Set<gm.Marker> markers() => tester.widget<gm.GoogleMap>(find.byType(gm.GoogleMap)).markers;
    expect(markers().length,5);
    for(final marker in markers()) { expect(marker.icon,isNot(gm.BitmapDescriptor.defaultMarker));expect(marker.infoWindow,gm.InfoWindow.noText); }
    final moved = [PassengerNearbyVehicle(id:initial.first.id,category:'moto',position:const LatLng(-2.819,-40.41))];
    await tester.pumpWidget(screen(moved));await tester.pump(const Duration(milliseconds:750));
    expect(markers().length,1);
    expect(markers().single.position.latitude,greaterThan(-2.82));
    expect(markers().single.position.latitude,lessThan(-2.819));
    await tester.pumpAndSettle();expect(markers().single.position.latitude,closeTo(-2.819,.000001));
    await tester.pumpWidget(screen(const []));await tester.pump();expect(markers(),isEmpty);
  });
}
