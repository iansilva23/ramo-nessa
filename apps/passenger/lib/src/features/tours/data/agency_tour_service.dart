import 'dart:convert';

import 'package:http/http.dart' as http;

class AgencyTour {
  const AgencyTour({
    required this.slug,
    required this.enabled,
    required this.sortOrder,
    required this.title,
    required this.badge,
    required this.shortDescription,
    required this.description,
    required this.highlights,
    required this.included,
    required this.excluded,
    required this.priceLabel,
    required this.whatsappPhone,
    required this.whatsappMessage,
    required this.coverImageVersion,
    required this.updatedAt,
    this.duration,
    this.schedule,
    this.departure,
    this.priceCents,
    this.priceSuffix,
    this.coverImageUrl,
  });

  factory AgencyTour.fromJson(
    Map<String, dynamic> json, {
    required Uri baseUrl,
  }) {
    String? optionalString(String key) {
      final value = json[key];
      return value is String && value.trim().isNotEmpty
          ? value.trim()
          : null;
    }

    List<String> strings(String key) {
      final value = json[key];
      return value is List
          ? value.whereType<String>().map((item) => item.trim()).where(
              (item) => item.isNotEmpty,
            ).toList(growable: false)
          : const [];
    }

    final rawCover = optionalString('coverImageUrl');
    return AgencyTour(
      slug: json['slug'] as String,
      enabled: json['enabled'] as bool? ?? true,
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
      title: json['title'] as String? ?? '',
      badge: json['badge'] as String? ?? 'EXPERIÊNCIA',
      shortDescription: json['shortDescription'] as String? ?? '',
      description: json['description'] as String? ?? '',
      highlights: strings('highlights'),
      included: strings('included'),
      excluded: strings('excluded'),
      duration: optionalString('duration'),
      schedule: optionalString('schedule'),
      departure: optionalString('departure'),
      priceLabel: json['priceLabel'] as String? ?? 'A partir de',
      priceCents: (json['priceCents'] as num?)?.toInt(),
      priceSuffix: optionalString('priceSuffix'),
      whatsappPhone: json['whatsappPhone'] as String? ?? '',
      whatsappMessage: json['whatsappMessage'] as String? ?? '',
      coverImageUrl:
          rawCover == null ? null : baseUrl.resolve(rawCover).toString(),
      coverImageVersion:
          (json['coverImageVersion'] as num?)?.toInt() ?? 0,
      updatedAt: DateTime.tryParse(
            json['updatedAt'] as String? ?? '',
          ) ??
          DateTime.fromMillisecondsSinceEpoch(0),
    );
  }

  final String slug;
  final bool enabled;
  final int sortOrder;
  final String title;
  final String badge;
  final String shortDescription;
  final String description;
  final List<String> highlights;
  final List<String> included;
  final List<String> excluded;
  final String? duration;
  final String? schedule;
  final String? departure;
  final String priceLabel;
  final int? priceCents;
  final String? priceSuffix;
  final String whatsappPhone;
  final String whatsappMessage;
  final String? coverImageUrl;
  final int coverImageVersion;
  final DateTime updatedAt;

  Uri? get reservationUri {
    final digits = whatsappPhone.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 10 || digits.length > 15) return null;
    final message = whatsappMessage.trim().isNotEmpty
        ? whatsappMessage.trim()
        : 'Olá! Quero reservar o passeio: $title.';
    return Uri.https(
      'wa.me',
      '/$digits',
      {'text': message},
    );
  }
}

abstract interface class AgencyTourService {
  Future<List<AgencyTour>> listTours();

  Future<AgencyTour?> getTour(String slug);
}

class HttpAgencyTourService implements AgencyTourService {
  HttpAgencyTourService({
    required Uri baseUrl,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _client = client ?? http.Client();

  final Uri _baseUrl;
  final http.Client _client;

  @override
  Future<List<AgencyTour>> listTours() async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/content/tours'),
          headers: {'accept': 'application/json'},
        )
        .timeout(const Duration(seconds: 10));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const FormatException(
        'Não foi possível carregar os passeios agora.',
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Resposta de passeios inválida.');
    }
    final rawTours = decoded['tours'];
    if (rawTours is! List) return const [];

    final tours = rawTours
        .whereType<Map<String, dynamic>>()
        .map(
          (tour) => AgencyTour.fromJson(
            tour,
            baseUrl: _baseUrl,
          ),
        )
        .where((tour) => tour.enabled)
        .toList(growable: false);
    tours.sort(
      (a, b) =>
          a.sortOrder.compareTo(b.sortOrder) != 0
              ? a.sortOrder.compareTo(b.sortOrder)
              : a.title.compareTo(b.title),
    );
    return tours;
  }

  @override
  Future<AgencyTour?> getTour(String slug) async {
    final response = await _client
        .get(
          _baseUrl.resolve(
            '/v1/content/tours/${Uri.encodeComponent(slug)}',
          ),
          headers: {'accept': 'application/json'},
        )
        .timeout(const Duration(seconds: 10));

    if (response.statusCode == 404) return null;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const FormatException(
        'Não foi possível carregar este passeio agora.',
      );
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Resposta do passeio inválida.');
    }
    final rawTour = decoded['tour'];
    if (rawTour is! Map<String, dynamic>) return null;
    return AgencyTour.fromJson(rawTour, baseUrl: _baseUrl);
  }
}

class PreviewAgencyTourService implements AgencyTourService {
  const PreviewAgencyTourService();

  static final List<AgencyTour> _tours = [
    _preview('lado-leste', 10, 'Passeio Lado Leste', 'COMPARTILHADO'),
    _preview('lado-oeste', 20, 'Passeio Lado Oeste', 'COMPARTILHADO'),
    _preview('por-do-sol', 30, 'Passeio Pôr do Sol', 'EXPERIÊNCIA'),
    _preview(
      'pedra-furada-bike-eletrica',
      40,
      'Pedra Furada de Bike Elétrica',
      'EXPERIÊNCIA',
    ),
    _preview('utv', 50, 'Passeio de UTV', 'PRIVATIVO'),
    _preview('barrinha', 60, 'Passeio Barrinha', 'EXPERIÊNCIA'),
    _preview('extremo-leste', 70, 'Passeio Extremo Leste', 'EXPERIÊNCIA'),
  ];

  static AgencyTour _preview(
    String slug,
    int sortOrder,
    String title,
    String badge,
  ) =>
      AgencyTour(
        slug: slug,
        enabled: true,
        sortOrder: sortOrder,
        title: title,
        badge: badge,
        shortDescription:
            'As informações deste passeio serão administradas pelo painel Ramo Nessa.',
        description:
            'No ambiente real, roteiro, horários, valores, foto e WhatsApp são carregados diretamente do painel administrativo.',
        highlights: const [],
        included: const [],
        excluded: const [],
        priceLabel: 'Consulte',
        whatsappPhone: '',
        whatsappMessage: '',
        coverImageVersion: 0,
        updatedAt: DateTime.fromMillisecondsSinceEpoch(0),
      );

  @override
  Future<List<AgencyTour>> listTours() async => List.unmodifiable(_tours);

  @override
  Future<AgencyTour?> getTour(String slug) async {
    for (final tour in _tours) {
      if (tour.slug == slug) return tour;
    }
    return null;
  }
}
