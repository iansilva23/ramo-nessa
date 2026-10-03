import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/core_place_search_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/data/place_search_service.dart';
import 'package:ramo_nessa_passenger/src/features/map/domain/ramo_place.dart';
import 'package:ramo_nessa_passenger/src/features/profile/data/passenger_saved_place_service.dart';
import 'package:ramo_nessa_passenger/src/features/profile/presentation/passenger_saved_places_screen.dart';

void main() {
  test('reverse-coordinate conserva alfinete mesmo com coordenadas diferentes na resposta', () async {
    final service = CorePlaceSearchService(baseUrl: Uri.parse('https://core.test'), accessToken: 'token',
      client: MockClient((request) async {
        expect(request.url.path, '/v1/maps/places/reverse-coordinate');
        expect(request.headers['authorization'], 'Bearer token');
        expect(jsonDecode(request.body)['latitude'], -2.820123);
        return http.Response(jsonEncode({'latitude': 1, 'longitude': 2,
          'address': {'name': 'Rua das Flores', 'address': 'Rua das Flores, Cruz'}}), 200);
      }));
    final place = await service.reverseCoordinate(const LatLng(-2.820123, -40.414567));
    expect(place!.position, const LatLng(-2.820123, -40.414567));
    expect(place.mapPinned, isTrue);
  });

  testWidgets('salva pin sem rua com Sem número, complemento e referência', (tester) async {
    final saved = _Saved();
    await tester.pumpWidget(MaterialApp(home: PassengerSavedPlacesScreen(service: saved, searchService: _Search(),
      pinScreenBuilder: (context, initial) => Scaffold(body: TextButton(onPressed: () => Navigator.of(context).pop(
        const RamoPlace(name: 'Local escolhido no mapa', address: 'Local escolhido no mapa',
          position: LatLng(-2.820123, -40.414567), mapPinned: true)), child: const Text('Escolher ponto de teste'))))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Casa').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Escolher no mapa'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Escolher ponto de teste'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Salvar endereço'));
    await tester.tap(find.text('Salvar endereço'));
    await tester.pumpAndSettle();
    expect(saved.position, isNull);
    expect(find.text('Informe o número ou marque Sem número.'), findsOneWidget);
    await tester.ensureVisible(find.text('Sem número'));
    await tester.tap(find.text('Sem número'));
    await tester.pump();
    await tester.enterText(find.widgetWithText(TextField, 'Complemento (opcional)'), 'Portão azul');
    await tester.enterText(find.widgetWithText(TextField, 'Ponto de referência (opcional)'), 'Ao lado da escola');
    await tester.ensureVisible(find.text('Salvar endereço'));
    await tester.tap(find.text('Salvar endereço'));
    await tester.pumpAndSettle();
    expect(saved.position, const LatLng(-2.820123, -40.414567));
    expect(saved.details, {'mapPinned': true, 'noNumber': true, 'complement': 'Portão azul', 'reference': 'Ao lado da escola'});
  });
}

class _Search implements PlaceSearchService {
  @override
  Future<List<RamoPlace>> search(String query) async => [];
}

class _Saved implements PassengerSavedPlaceService {
  LatLng? position;
  Map<String, dynamic>? details;
  @override
  Future<List<PassengerSavedPlace>> list() async => [];
  @override
  Future<void> delete(String id) async {}
  @override
  Future<PassengerSavedPlace> save({String? id, Map<String, dynamic>? addressDetails,
    required String kind, String? label, required String name, required String address, required LatLng position,
    String? providerPlaceId, String? approvedPricingZoneId, String? approvedPricingLocalityId}) async {
    this.position = position;
    details = addressDetails;
    return PassengerSavedPlace(id: 'test-id', kind: kind, label: label ?? 'Casa', name: name, address: address,
      position: position, addressDetails: addressDetails ?? {}, createdAt: DateTime.now(), updatedAt: DateTime.now());
  }
}
