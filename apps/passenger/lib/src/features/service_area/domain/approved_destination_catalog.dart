import '../../map/domain/ramo_place.dart';

class ApprovedExternalDestination {
  const ApprovedExternalDestination({
    required this.id,
    required this.label,
    required this.aliases,
  });

  final String id;
  final String label;
  final List<String> aliases;
}

/// Destinos externos que fazem parte da tabela comercial v1.
///
/// A busca pode sair do recorte Jeri/Jijoca/Preá somente quando a consulta
/// corresponde a um destes destinos. Isso evita transformar a busca do MVP em
/// uma busca nacional sem existir preço/regra comercial para a rota.
abstract final class ApprovedDestinationCatalog {
  static const destinations = <ApprovedExternalDestination>[
    ApprovedExternalDestination(
      id: 'triangulo-do-marco',
      label: 'Triângulo do Marco',
      aliases: ['triangulo do marco'],
    ),
    ApprovedExternalDestination(
      id: 'santana-do-acarau',
      label: 'Santana do Acaraú',
      aliases: ['santana do acarau'],
    ),
    ApprovedExternalDestination(
      id: 'bela-cruz',
      label: 'Bela Cruz',
      aliases: ['bela cruz'],
    ),
    ApprovedExternalDestination(
      id: 'itapipoca',
      label: 'Itapipoca',
      aliases: ['itapipoca'],
    ),
    ApprovedExternalDestination(
      id: 'parazinha',
      label: 'Parazinha',
      aliases: ['parazinha'],
    ),
    ApprovedExternalDestination(
      id: 'morrinhos',
      label: 'Morrinhos',
      aliases: ['morrinhos'],
    ),
    ApprovedExternalDestination(
      id: 'amontada',
      label: 'Amontada',
      aliases: ['amontada'],
    ),
    ApprovedExternalDestination(
      id: 'camocim',
      label: 'Camocim',
      aliases: ['camocim'],
    ),
    ApprovedExternalDestination(
      id: 'itarema',
      label: 'Itarema',
      aliases: ['itarema'],
    ),
    ApprovedExternalDestination(
      id: 'acarau',
      label: 'Acaraú',
      aliases: ['acarau'],
    ),
    ApprovedExternalDestination(
      id: 'granja',
      label: 'Granja',
      aliases: ['granja'],
    ),
    ApprovedExternalDestination(
      id: 'sobral',
      label: 'Sobral',
      aliases: ['sobral'],
    ),
    ApprovedExternalDestination(
      id: 'marco',
      label: 'Marco',
      aliases: ['marco'],
    ),
    ApprovedExternalDestination(
      id: 'cruz',
      label: 'Cruz',
      aliases: ['cruz'],
    ),
  ];

  static ApprovedExternalDestination? matchQuery(String query) {
    final normalized = normalize(query);
    for (final destination in destinations) {
      if (destination.aliases.any(
        (alias) => normalize(alias) == normalized,
      )) {
        return destination;
      }
    }
    return null;
  }

  static ApprovedExternalDestination? matchPlace(RamoPlace place) {
    final normalizedName = normalize(place.name);
    final normalizedAddress = normalize(place.address);

    // Nome exato primeiro para não confundir "Marco" com
    // "Triângulo do Marco", por exemplo.
    for (final destination in destinations) {
      if (destination.aliases.any(
        (alias) => normalize(alias) == normalizedName,
      )) {
        return destination;
      }
    }

    for (final destination in destinations) {
      for (final alias in destination.aliases) {
        final normalizedAlias = normalize(alias);
        if (normalizedAddress.contains(normalizedAlias)) {
          return destination;
        }
      }
    }

    return null;
  }

  static String normalize(String value) {
    return value
        .trim()
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
}
