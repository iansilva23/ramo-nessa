import 'dart:convert';

import 'package:http/http.dart' as http;

class GuideAction {
  GuideAction(Map<String, dynamic> json)
    : id = json['id'] as String,
      type = json['type'] as String,
      label = json['label'] as String? ?? '',
      primary = json['primary'] == true,
      enabled = json['enabled'] != false,
      url = json['url'] as String?,
      phone = json['phone'] as String?,
      message = json['message'] as String?,
      targetId = json['targetId'] as String?;
  final String id, type, label;
  final bool primary, enabled;
  final String? url, phone, message, targetId;
  String get title => label.isNotEmpty
      ? label
      : const {
              'route': 'Calcular rota',
              'instagram': 'Instagram',
              'whatsapp': 'WhatsApp',
              'website': 'Site',
              'internal': 'Saiba mais',
            }[type] ??
            'Saiba mais';
  Uri? get externalUri {
    if (type == 'whatsapp') {
      final digits = (phone ?? '').replaceAll(RegExp(r'[^0-9]'), '');
      if (!RegExp(r'^[1-9][0-9]{9,14}$').hasMatch(digits)) return null;
      return Uri.https('wa.me', '/$digits', {
        if (message?.isNotEmpty == true) 'text': message!,
      });
    }
    if (type != 'instagram' && type != 'website') return null;
    final uri = Uri.tryParse(url ?? '');
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty) {
      return null;
    }
    if (type == 'instagram' &&
        !['instagram.com', 'www.instagram.com'].contains(uri.host)) {
      return null;
    }
    return uri;
  }
}

class GuideEntry {
  GuideEntry(this.json, {this.baseUrl});
  final Map<String, dynamic> json;
  final Uri? baseUrl;
  String text(String key) => json[key] as String? ?? '';
  List<String> strings(String key) => (json[key] as List? ?? const [])
      .whereType<String>()
      .toList(growable: false);
  String get id => text('id');
  String get kind => text('kind');
  String? get parentId => json['parentId'] as String?;
  String get name => text('name');
  String get summary => text('summary');
  String get template => text('template');
  bool get featured => json['featured'] == true;
  int get order => (json['order'] as num? ?? 0).toInt();
  double? get latitude => (json['latitude'] as num?)?.toDouble();
  double? get longitude => (json['longitude'] as num?)?.toDouble();
  double get imagePosition =>
      ((json['imagePosition'] as num? ?? 50).toDouble().clamp(0, 100) / 50) - 1;
  bool get validCoordinates =>
      latitude != null &&
      longitude != null &&
      latitude!.isFinite &&
      longitude!.isFinite &&
      latitude!.abs() <= 90 &&
      longitude!.abs() <= 180;
  String? get imageUrl {
    final path = text('image');
    if (baseUrl == null ||
        !RegExp(r'^/v1/content/guide/images/[a-zA-Z0-9_-]{1,100}$')
            .hasMatch(path)) {
      return null;
    }
    return baseUrl!.resolve(path).toString();
  }

  List<GuideAction> get actions => (json['actions'] as List? ?? const [])
      .whereType<Map>()
      .map((e) => GuideAction(Map<String, dynamic>.from(e)))
      .where((a) => a.enabled && a.type != 'none')
      .toList(growable: false);
}

class GuideCatalog {
  const GuideCatalog({required this.entries, this.stale = false});
  final List<GuideEntry> entries;
  final bool stale;
  List<GuideEntry> children(String? parentId, String kind) =>
      entries.where((e) => e.parentId == parentId && e.kind == kind).toList()
        ..sort((a, b) {
          final order = a.order.compareTo(b.order);
          return order != 0 ? order : a.name.compareTo(b.name);
        });
  GuideEntry? find(String? id) {
    for (final e in entries) {
      if (e.id == id) return e;
    }
    return null;
  }
}

abstract interface class LocalGuideService {
  Future<GuideCatalog> load({bool refresh = false});
}

class HttpLocalGuideService implements LocalGuideService {
  HttpLocalGuideService({required this.baseUrl, http.Client? client})
    : _client = client ?? http.Client();
  final Uri baseUrl;
  final http.Client _client;
  GuideCatalog? _cached;
  DateTime? _at;
  Future<GuideCatalog>? _pending;
  @override
  Future<GuideCatalog> load({bool refresh = false}) {
    if (!refresh &&
        _cached != null &&
        DateTime.now().difference(_at!) < const Duration(minutes: 3)) {
      return Future.value(_cached);
    }
    return _pending ??= _fetch().whenComplete(() => _pending = null);
  }

  Future<GuideCatalog> _fetch() async {
    try {
      final response = await _client
          .get(
            baseUrl.resolve('/v1/content/guide'),
            headers: {'accept': 'application/json'},
          )
          .timeout(const Duration(seconds: 15));
      if (response.statusCode != 200) {
        throw StateError('O Guia está indisponível agora.');
      }
      final json = jsonDecode(response.body);
      if (json is! Map || json['entities'] is! List) {
        throw const FormatException('Guia inválido.');
      }
      final entries = (json['entities'] as List)
          .whereType<Map>()
          .map(
            (e) => GuideEntry(Map<String, dynamic>.from(e), baseUrl: baseUrl),
          )
          .where(
            (e) =>
                e.id.isNotEmpty &&
                e.name.isNotEmpty &&
                ['locality', 'category', 'item'].contains(e.kind),
          )
          .toList(growable: false);
      _cached = GuideCatalog(entries: List.unmodifiable(entries));
      _at = DateTime.now();
      return _cached!;
    } catch (_) {
      if (_cached != null) {
        return GuideCatalog(entries: _cached!.entries, stale: true);
      }
      throw StateError(
        'Não foi possível carregar o Guia. Confira sua conexão e tente novamente.',
      );
    }
  }
}

class EmptyLocalGuideService implements LocalGuideService {
  const EmptyLocalGuideService();
  @override
  Future<GuideCatalog> load({bool refresh = false}) async =>
      const GuideCatalog(entries: []);
}
