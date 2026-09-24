class PassengerAccountSnapshot {
  const PassengerAccountSnapshot({
    required this.subjectId,
    required this.phoneE164,
    this.email,
    this.fullName,
    this.photoUrl,
  });

  factory PassengerAccountSnapshot.fromJson(Map<String, dynamic> json) {
    final subjectId = json['subjectId'];
    final phoneE164 = json['phoneE164'];
    if (subjectId is! String || phoneE164 is! String) {
      throw const FormatException('Conta de passageiro inválida.');
    }
    return PassengerAccountSnapshot(
      subjectId: subjectId,
      phoneE164: phoneE164,
      email: json['email'] as String?,
      fullName: json['fullName'] as String?,
      photoUrl: json['photoUrl'] as String?,
    );
  }

  final String subjectId;
  final String phoneE164;
  final String? email;
  final String? fullName;
  final String? photoUrl;

  String get displayName =>
      fullName?.trim().isNotEmpty == true ? fullName!.trim() : 'Passageiro';
}

class PassengerActivityRide {
  const PassengerActivityRide({
    required this.id,
    required this.state,
    required this.category,
    required this.originZoneId,
    required this.destinationZoneId,
    required this.totalAmountCents,
    required this.updatedAt,
    this.paymentMethod,
  });

  factory PassengerActivityRide.fromJson(Map<String, dynamic> json) {
    final origin = json['origin'] as Map<String, dynamic>? ?? const {};
    final destination =
        json['destination'] as Map<String, dynamic>? ?? const {};
    return PassengerActivityRide(
      id: json['id'] as String,
      state: json['state'] as String,
      category: json['category'] as String,
      originZoneId: origin['zoneId'] as String? ?? 'origem',
      destinationZoneId: destination['zoneId'] as String? ?? 'destino',
      totalAmountCents: (json['totalAmountCents'] as num).toInt(),
      paymentMethod: json['paymentMethod'] as String?,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  final String id;
  final String state;
  final String category;
  final String originZoneId;
  final String destinationZoneId;
  final int totalAmountCents;
  final String? paymentMethod;
  final DateTime updatedAt;

  String get stateLabel => switch (state) {
        'COMPLETED' => 'Concluída',
        'CANCELLED_BY_PASSENGER' => 'Cancelada',
        'CANCELLED_BY_DRIVER' => 'Cancelada pelo motorista',
        'CANCELLED_BY_ADMIN' => 'Cancelada pelo suporte',
        'IN_PROGRESS' => 'Em andamento',
        'DRIVER_ARRIVED' => 'Motorista chegou',
        'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' => 'Motorista a caminho',
        'SEARCHING_DRIVER' || 'PAID' => 'Procurando motorista',
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
    final summary =
        json['summary'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    final rides = json['rides'];
    return PassengerActivitySnapshot(
      total: (summary['total'] as num?)?.toInt() ?? 0,
      active: (summary['active'] as num?)?.toInt() ?? 0,
      completed: (summary['completed'] as num?)?.toInt() ?? 0,
      cancelled: (summary['cancelled'] as num?)?.toInt() ?? 0,
      completedAmountCents:
          (summary['completedAmountCents'] as num?)?.toInt() ?? 0,
      rides: rides is List
          ? rides
              .whereType<Map<String, dynamic>>()
              .map(PassengerActivityRide.fromJson)
              .toList(growable: false)
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
