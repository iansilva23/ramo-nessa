import '../../map/domain/place.dart';

class PassengerActivityRide {
  const PassengerActivityRide({
    required this.id,
    required this.state,
    required this.category,
    required this.origin,
    required this.destination,
    required this.totalAmountCents,
    required this.createdAt,
    required this.updatedAt,
    this.paymentMethod,
  });

  factory PassengerActivityRide.fromJson(Map<String, dynamic> json) {
    return PassengerActivityRide(
      id: json['id'] as String,
      state: json['state'] as String,
      category: json['category'] as String,
      origin: _locationLabel(json['origin']),
      destination: _locationLabel(json['destination']),
      totalAmountCents: (json['totalAmountCents'] as num).toInt(),
      paymentMethod: json['paymentMethod'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  final String id;
  final String state;
  final String category;
  final String origin;
  final String destination;
  final int totalAmountCents;
  final String? paymentMethod;
  final DateTime createdAt;
  final DateTime updatedAt;

  String get stateLabel => switch (state) {
        'COMPLETED' => 'Concluída',
        'CANCELLED_BY_PASSENGER' => 'Cancelada por você',
        'CANCELLED_BY_DRIVER' => 'Cancelada pelo motorista',
        'CANCELLED_BY_ADMIN' => 'Cancelada pelo suporte',
        'IN_PROGRESS' => 'Em andamento',
        'DRIVER_ARRIVED' => 'Motorista chegou',
        'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' => 'Motorista a caminho',
        'SEARCHING_DRIVER' => 'Procurando motorista',
        _ => state,
      };

  String get categoryLabel => switch (category) {
        'moto' => 'Moto',
        'car' => 'Carro',
        'comfort_black' => 'Comfort / Black',
        'buggy' => 'Buggy',
        'delivery' => 'Entrega',
        _ => category,
      };

  static String _locationLabel(dynamic raw) {
    if (raw is! Map) return 'Local';
    final map=Map<String,dynamic>.from(raw);
    final locality=map['localityId'] as String?;
    final zone=map['zoneId'] as String?;
    final value=locality ?? zone ?? 'local';
    return value
        .split(RegExp(r'[-_]'))
        .where((part) => part.isNotEmpty)
        .map((part) => part.length == 1
            ? part.toUpperCase()
            : '${part[0].toUpperCase()}${part.substring(1)}')
        .join(' ');
  }
}

class PassengerActivitySnapshot {
  const PassengerActivitySnapshot({
    required this.total,
    required this.active,
    required this.completed,
    required this.cancelled,
    required this.completedAmountCents,
    required this.rides,
  });

  factory PassengerActivitySnapshot.fromJson(Map<String, dynamic> json) {
    final summary=json['summary'] as Map<String,dynamic>? ??
        const <String,dynamic>{};
    final rides=json['rides'];
    return PassengerActivitySnapshot(
      total:(summary['total'] as num?)?.toInt() ?? 0,
      active:(summary['active'] as num?)?.toInt() ?? 0,
      completed:(summary['completed'] as num?)?.toInt() ?? 0,
      cancelled:(summary['cancelled'] as num?)?.toInt() ?? 0,
      completedAmountCents:
          (summary['completedAmountCents'] as num?)?.toInt() ?? 0,
      rides:rides is List
          ? rides
              .whereType<Map<String,dynamic>>()
              .map(PassengerActivityRide.fromJson)
              .toList(growable:false)
          : const [],
    );
  }

  final int total;
  final int active;
  final int completed;
  final int cancelled;
  final int completedAmountCents;
  final List<PassengerActivityRide> rides;
}
