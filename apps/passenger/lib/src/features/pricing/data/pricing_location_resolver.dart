import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

import '../../map/domain/ramo_place.dart';

class PricingLocationRef {
  const PricingLocationRef({
    required this.zoneId,
    this.localityId,
  });

  final String zoneId;
  final String? localityId;

  Map<String, dynamic> toJson() => {
        'zoneId': zoneId,
        if (localityId != null) 'localityId': localityId,
      };
}

abstract final class PricingLocationResolver {
  static const _preaCenter = LatLng(-2.82017, -40.41467);
  static const _jijocaCenter = LatLng(-2.89860, -40.45060);
  static const _hubRecognitionRadiusKm = 2.0;

  static PricingLocationRef resolve({
    required RamoPlace place,
    required String serviceZoneId,
  }) {
    if (serviceZoneId == 'airport-jjd') {
      return const PricingLocationRef(
        zoneId: 'external',
        localityId: 'airport-jjd',
      );
    }

    final name = _normalize(place.name);
    final text = _normalize('${place.name} ${place.address}');

    String? localityId;
    if (serviceZoneId == 'prea') {
      localityId = _match(name, _preaAliases) ?? _match(text, _preaAliases);
      localityId ??= _isNear(place.position, _preaCenter) ? 'prea' : null;
    } else if (serviceZoneId == 'jijoca') {
      localityId =
          _match(name, _jijocaAliases) ?? _match(text, _jijocaAliases);
      localityId ??= _isNear(place.position, _jijocaCenter) ? 'jijoca' : null;
    }

    return PricingLocationRef(
      zoneId: serviceZoneId,
      localityId: localityId,
    );
  }

  static bool _isNear(LatLng point, LatLng center) {
    return _distanceKm(point, center) <= _hubRecognitionRadiusKm;
  }

  static double _distanceKm(LatLng a, LatLng b) {
    const earthRadiusKm = 6371.0;
    double radians(double degrees) => degrees * math.pi / 180;

    final lat1 = radians(a.latitude);
    final lat2 = radians(b.latitude);
    final deltaLat = radians(b.latitude - a.latitude);
    final deltaLon = radians(b.longitude - a.longitude);

    final h = math.pow(math.sin(deltaLat / 2), 2) +
        math.cos(lat1) *
            math.cos(lat2) *
            math.pow(math.sin(deltaLon / 2), 2);

    return earthRadiusKm *
        2 *
        math.atan2(math.sqrt(h), math.sqrt(1 - h));
  }

  static String? _match(String text, Map<String, List<String>> aliases) {
    for (final entry in aliases.entries) {
      if (entry.value.any(text.contains)) {
        return entry.key;
      }
    }
    return null;
  }

  static String _normalize(String value) {
    return value
        .toLowerCase()
        .replaceAll('á', 'a')
        .replaceAll('à', 'a')
        .replaceAll('ã', 'a')
        .replaceAll('â', 'a')
        .replaceAll('é', 'e')
        .replaceAll('ê', 'e')
        .replaceAll('í', 'i')
        .replaceAll('ó', 'o')
        .replaceAll('ô', 'o')
        .replaceAll('õ', 'o')
        .replaceAll('ú', 'u')
        .replaceAll('ç', 'c');
  }

  static const _preaAliases = <String, List<String>>{
    'caicara-de-baixo': ['caicara de baixo'],
    'corrego-das-panelas': ['corrego das panelas'],
    'corrego-dos-anas': ['corrego dos anas'],
    'guias-monteiros': ['guias monteiros'],
    'lagoa-do-paraiso': ['lagoa do paraiso'],
    'lagoa-azul': ['lagoa azul'],
    'buraco-azul': ['buraco azul'],
    'cavalo-bravo': ['cavalo bravo'],
    'barrinha-de-baixo': ['barrinha de baixo'],
    'triangulo-do-marco': ['triangulo do marco'],
    'santana-do-acarau': ['santana do acarau'],
    'prea-beach-villas': ['prea beach villas'],
    'clube-da-irrancha': ['clube da irrancha'],
    'casas-eli-lula': ['casas eli lula'],
    'casa-de-praia-teto-branco': ['casa de praia teto branco'],
    'vida-ao-vento': ['vida ao vento'],
    'kite-lodge': ['kite lodge'],
    'beach-house': ['beach house'],
    'play-kitie': ['play kitie'],
    'd3-luna': ['d3 luna'],
    'vila-prea': ['vila prea'],
    'cajueirinho': ['cajueirinho'],
    'castelhano': ['castelhano'],
    'carrapateiras': ['carrapateiras'],
    'pinguela': ['pinguela'],
    'lagamar': ['lagamar'],
    'munzua': ['munzua'],
    'aranau': ['aranau'],
    'formosa': ['formosa'],
    'caicara': ['caicara'],
    'laguim': ['laguim'],
    'cabana': ['cabana'],
    'ranchos': ['ranchos'],
    'prea': ['prea'],
    'bela-cruz': ['bela cruz'],
    'parazinha': ['parazinha'],
    'itapipoca': ['itapipoca'],
    'morrinhos': ['morrinhos'],
    'amontada': ['amontada'],
    'camocim': ['camocim'],
    'granja': ['granja'],
    'itarema': ['itarema'],
    'sobral': ['sobral'],
    'acarau': ['acarau'],
    'marco': ['marco'],
    'cruz': ['cruz'],
    'ius': ['ius'],
  };

  static const _jijocaAliases = <String, List<String>>{
    'corrego-da-forquilha-ii': ['corrego da forquilha ii'],
    'corrego-da-forquilha-i': ['corrego da forquilha i'],
    'corrego-do-mourao': ['corrego do mourao'],
    'corrego-do-urubu': ['corrego do urubu'],
    'corrego-perdido': ['corrego perdido'],
    'corrego-de-dentro': ['corrego de dentro'],
    'cruzeiro-do-brandao': ['cruzeiro do brandao'],
    'lagoa-das-pedras': ['lagoa das pedras'],
    'vila-sao-paulo': ['vila sao paulo'],
    'carro-quebrado': ['carro quebrado'],
    'caminho-mangue-seco': ['caminho para mangue seco'],
    'proximo-mangue-seco': ['proximo ao mangue seco'],
    'mangue-seco': ['mangue seco'],
    'chapadinha': ['chapadinha'],
    'baixio': ['baixio'],
    'jijoca': ['jijoca'],
  };
}
