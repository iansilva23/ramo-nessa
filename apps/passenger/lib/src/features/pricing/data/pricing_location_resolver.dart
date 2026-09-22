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

    final text = _normalize('${place.name} ${place.address}');

    final localityId = switch (serviceZoneId) {
      'prea' => _match(text, _preaAliases),
      'jijoca' => _match(text, _jijocaAliases),
      _ => null,
    };

    return PricingLocationRef(
      zoneId: serviceZoneId,
      localityId: localityId,
    );
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
    'play-kitie': ['play kitie', 'play kitie'],
    'd3-luna': ['d3 luna'],
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
    'vila-prea': ['vila prea'],
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
    'ius': [' ius '],
    'prea': ['prea'],
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
