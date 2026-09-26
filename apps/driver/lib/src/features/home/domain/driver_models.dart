class DriverSupplySnapshot {
  const DriverSupplySnapshot({
    required this.driverId,
    required this.vehicleId,
    required this.categories,
    required this.fourByFour,
    required this.seatCapacity,
    required this.online,
    required this.busy,
    required this.latitude,
    required this.longitude,
    required this.locationUpdatedAt,
  });

  factory DriverSupplySnapshot.fromJson(Map<String, dynamic> json) {
    return DriverSupplySnapshot(
      driverId: json['driverId'] as String,
      vehicleId: json['vehicleId'] as String,
      categories: (json['categories'] as List<dynamic>)
          .map((item) => item as String)
          .toList(growable: false),
      fourByFour: json['fourByFour'] as bool,
      seatCapacity: (json['seatCapacity'] as num).toInt(),
      online: json['online'] as bool,
      busy: json['busy'] as bool,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      locationUpdatedAt: DateTime.parse(json['locationUpdatedAt'] as String),
    );
  }

  final String driverId;
  final String vehicleId;
  final List<String> categories;
  final bool fourByFour;
  final int seatCapacity;
  final bool online;
  final bool busy;
  final double latitude;
  final double longitude;
  final DateTime locationUpdatedAt;
}

class DriverLocationRef {
  const DriverLocationRef({required this.zoneId, this.localityId});

  factory DriverLocationRef.fromJson(Map<String, dynamic> json) {
    return DriverLocationRef(
      zoneId: json['zoneId'] as String,
      localityId: json['localityId'] as String?,
    );
  }

  final String zoneId;
  final String? localityId;

  String get displayName {
    final raw = localityId ?? zoneId;
    const known = {
      'jericoacoara': 'Jericoacoara',
      'jijoca': 'Jijoca',
      'prea': 'Preá',
      'airport-jjd': 'Aeroporto JJD',
      'aeroporto-jjd': 'Aeroporto JJD',
    };
    final name = known[raw];
    if (name != null) return name;
    return raw
        .split(RegExp('[-_]'))
        .where((part) => part.isNotEmpty)
        .map((part) =>
            part.length == 1
                ? part.toUpperCase()
                : '${part[0].toUpperCase()}${part.substring(1)}')
        .join(' ');
  }
}

class DriverOffer {
  const DriverOffer({
    required this.id,
    required this.rideId,
    required this.expiresAt,
    required this.approximatePickupDistanceKm,
    this.tripDistanceKm,
    this.pickupLatitude,
    this.pickupLongitude,
    this.dropoffLatitude,
    this.dropoffLongitude,
    required this.category,
    required this.passengers,
    required this.origin,
    required this.destination,
    required this.driverEarningsCents,
    required this.pickupCompensationCents,
    this.paymentMethod,
    this.cashCollectionAmountCents,
    this.cashCommissionCents,
  });

  factory DriverOffer.fromJson(Map<String, dynamic> json) {
    return DriverOffer(
      id: json['id'] as String,
      rideId: json['rideId'] as String,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      approximatePickupDistanceKm:
          (json['approximatePickupDistanceKm'] as num).toDouble(),
      tripDistanceKm: (json['tripDistanceKm'] as num?)?.toDouble(),
      pickupLatitude: (json['pickupLatitude'] as num?)?.toDouble(),
      pickupLongitude: (json['pickupLongitude'] as num?)?.toDouble(),
      dropoffLatitude: (json['dropoffLatitude'] as num?)?.toDouble(),
      dropoffLongitude: (json['dropoffLongitude'] as num?)?.toDouble(),
      category: json['category'] as String,
      passengers: (json['passengers'] as num).toInt(),
      origin: DriverLocationRef.fromJson(
        json['origin'] as Map<String, dynamic>,
      ),
      destination: DriverLocationRef.fromJson(
        json['destination'] as Map<String, dynamic>,
      ),
      driverEarningsCents: (json['driverEarningsCents'] as num).toInt(),
      pickupCompensationCents:
          (json['pickupCompensationCents'] as num).toInt(),
      paymentMethod: json['paymentMethod'] as String?,
      cashCollectionAmountCents:
          (json['cashCollectionAmountCents'] as num?)?.toInt(),
      cashCommissionCents:
          (json['cashCommissionCents'] as num?)?.toInt(),
    );
  }

  final String id;
  final String rideId;
  final DateTime expiresAt;
  final double approximatePickupDistanceKm;
  final double? tripDistanceKm;
  final double? pickupLatitude;
  final double? pickupLongitude;
  final double? dropoffLatitude;
  final double? dropoffLongitude;
  final String category;
  final int passengers;
  final DriverLocationRef origin;
  final DriverLocationRef destination;
  final int driverEarningsCents;
  final int pickupCompensationCents;
  final String? paymentMethod;
  final int? cashCollectionAmountCents;
  final int? cashCommissionCents;

  bool get isCash => paymentMethod == 'cash';

  String get categoryLabel => switch (category) {
        'moto' => 'Moto',
        'car' => 'Carro',
        'comfort_black' => 'Comfort / Black',
        'buggy' => 'Buggy',
        'delivery' => 'Entrega',
        _ => category,
      };
}

class AcceptedDriverRide {
  const AcceptedDriverRide({
    required this.id,
    required this.state,
    required this.category,
    required this.passengers,
    required this.origin,
    required this.destination,
    required this.driverEarningsCents,
    required this.pickupCompensationCents,
    this.paymentMethod,
    this.cashCollectionAmountCents,
    this.cashCommissionCents,
    this.pickupLatitude,
    this.pickupLongitude,
    this.dropoffLatitude,
    this.dropoffLongitude,
  });

  factory AcceptedDriverRide.fromJson(Map<String, dynamic> json) {
    return AcceptedDriverRide(
      id: json['id'] as String,
      state: json['state'] as String,
      category: json['category'] as String,
      passengers: (json['passengers'] as num).toInt(),
      origin: DriverLocationRef.fromJson(
        json['origin'] as Map<String, dynamic>,
      ),
      destination: DriverLocationRef.fromJson(
        json['destination'] as Map<String, dynamic>,
      ),
      driverEarningsCents: (json['driverEarningsCents'] as num).toInt(),
      pickupCompensationCents:
          (json['pickupCompensationCents'] as num).toInt(),
      paymentMethod: json['paymentMethod'] as String?,
      cashCollectionAmountCents:
          (json['cashCollectionAmountCents'] as num?)?.toInt(),
      cashCommissionCents:
          (json['cashCommissionCents'] as num?)?.toInt(),
      pickupLatitude: (json['pickupLatitude'] as num?)?.toDouble(),
      pickupLongitude: (json['pickupLongitude'] as num?)?.toDouble(),
      dropoffLatitude: (json['dropoffLatitude'] as num?)?.toDouble(),
      dropoffLongitude: (json['dropoffLongitude'] as num?)?.toDouble(),
    );
  }

  final String id;
  final String state;
  final String category;
  final int passengers;
  final DriverLocationRef origin;
  final DriverLocationRef destination;
  final int driverEarningsCents;
  final int pickupCompensationCents;
  final String? paymentMethod;
  final int? cashCollectionAmountCents;
  final int? cashCommissionCents;
  final double? pickupLatitude;
  final double? pickupLongitude;
  final double? dropoffLatitude;
  final double? dropoffLongitude;

  bool get isCash => paymentMethod == 'cash';
}

String formatCents(int cents) {
  final reais = cents ~/ 100;
  final centavos = (cents % 100).toString().padLeft(2, '0');
  return 'R\$ $reais,$centavos';
}


class DriverRideCompletion {
  const DriverRideCompletion({
    required this.ride,
    required this.driverBalanceCents,
    required this.duplicateSettlement,
  });

  factory DriverRideCompletion.fromJson(Map<String, dynamic> json) {
    final settlement = json['settlement'] as Map<String, dynamic>;
    return DriverRideCompletion(
      ride: AcceptedDriverRide.fromJson(
        json['ride'] as Map<String, dynamic>,
      ),
      driverBalanceCents:
          (settlement['driverBalanceCents'] as num).toInt(),
      duplicateSettlement: settlement['duplicate'] as bool? ?? false,
    );
  }

  final AcceptedDriverRide ride;
  final int driverBalanceCents;
  final bool duplicateSettlement;
}


class DriverRideChatMessage {
  const DriverRideChatMessage({
    required this.id,
    required this.rideId,
    required this.senderType,
    required this.senderId,
    required this.body,
    required this.createdAt,
  });

  factory DriverRideChatMessage.fromJson(Map<String, dynamic> json) {
    return DriverRideChatMessage(
      id: json['id'] as String,
      rideId: json['rideId'] as String,
      senderType: json['senderType'] as String,
      senderId: json['senderId'] as String,
      body: json['body'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  final String id;
  final String rideId;
  final String senderType;
  final String senderId;
  final String body;
  final DateTime createdAt;

  bool get fromDriver => senderType == 'driver';
}

class DriverFinanceSummary {
  const DriverFinanceSummary({
    required this.availableBalanceCents,
    required this.payoutPendingCents,
    this.cashCommissionDebtCents = 0,
  });

  factory DriverFinanceSummary.fromJson(Map<String, dynamic> json) {
    return DriverFinanceSummary(
      availableBalanceCents:
          (json['availableBalanceCents'] as num).toInt(),
      payoutPendingCents:
          (json['payoutPendingCents'] as num).toInt(),
      cashCommissionDebtCents:
          (json['cashCommissionDebtCents'] as num?)?.toInt() ?? 0,
    );
  }

  final int availableBalanceCents;
  final int payoutPendingCents;
  final int cashCommissionDebtCents;
}

class DriverStatementItem {
  const DriverStatementItem({
    required this.id,
    required this.kind,
    required this.title,
    required this.availableDeltaCents,
    required this.pendingDeltaCents,
    required this.debtDeltaCents,
    required this.platformFeeCents,
    required this.balanceAfterCents,
    required this.createdAt,
    this.rideId,
    this.payoutId,
  });

  factory DriverStatementItem.fromJson(Map<String, dynamic> json) {
    return DriverStatementItem(
      id: json['id'] as String,
      kind: json['kind'] as String,
      title: json['title'] as String? ?? 'Movimentação financeira',
      availableDeltaCents:
          (json['availableDeltaCents'] as num?)?.toInt() ?? 0,
      pendingDeltaCents:
          (json['pendingDeltaCents'] as num?)?.toInt() ?? 0,
      debtDeltaCents:
          (json['debtDeltaCents'] as num?)?.toInt() ?? 0,
      platformFeeCents:
          (json['platformFeeCents'] as num?)?.toInt() ?? 0,
      balanceAfterCents:
          (json['balanceAfterCents'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      rideId: json['rideId'] as String?,
      payoutId: json['payoutId'] as String?,
    );
  }

  final String id;
  final String kind;
  final String title;
  final int availableDeltaCents;
  final int pendingDeltaCents;
  final int debtDeltaCents;
  final int platformFeeCents;
  final int balanceAfterCents;
  final DateTime createdAt;
  final String? rideId;
  final String? payoutId;

  bool get isCredit => availableDeltaCents > 0;
  bool get isDebit => availableDeltaCents < 0;
}

class DriverFinanceStatement {
  const DriverFinanceStatement({
    required this.generatedAt,
    required this.finance,
    required this.items,
  });

  factory DriverFinanceStatement.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
    return DriverFinanceStatement(
      generatedAt: DateTime.parse(json['generatedAt'] as String),
      finance: DriverFinanceSummary.fromJson(
        json['finance'] as Map<String, dynamic>,
      ),
      items: rawItems is List
          ? rawItems
              .whereType<Map<String, dynamic>>()
              .map(DriverStatementItem.fromJson)
              .toList(growable: false)
          : const [],
    );
  }

  final DateTime generatedAt;
  final DriverFinanceSummary finance;
  final List<DriverStatementItem> items;
}


class DriverPayoutDestination {
  const DriverPayoutDestination({
    required this.configured,
    this.pixKeyType,
    this.pixKeyMasked,
    this.updatedAt,
  });

  factory DriverPayoutDestination.fromJson(Map<String, dynamic> json) {
    return DriverPayoutDestination(
      configured: json['configured'] as bool? ?? false,
      pixKeyType: json['pixKeyType'] as String?,
      pixKeyMasked: json['pixKeyMasked'] as String?,
      updatedAt: json['updatedAt'] == null
          ? null
          : DateTime.parse(json['updatedAt'] as String),
    );
  }

  final bool configured;
  final String? pixKeyType;
  final String? pixKeyMasked;
  final DateTime? updatedAt;

  String get typeLabel => switch (pixKeyType) {
        'cpf' => 'CPF',
        'cnpj' => 'CNPJ',
        'email' => 'E-mail',
        'phone' => 'Celular',
        'random' => 'Chave aleatória',
        _ => 'Pix',
      };
}

class DriverPayoutReservation {
  const DriverPayoutReservation({
    required this.id,
    required this.amountCents,
    required this.status,
    required this.finance,
    required this.duplicateRequest,
  });

  factory DriverPayoutReservation.fromJson(Map<String, dynamic> json) {
    final payout = json['payout'] as Map<String, dynamic>;
    return DriverPayoutReservation(
      id: payout['id'] as String,
      amountCents: (payout['amountCents'] as num).toInt(),
      status: payout['status'] as String,
      finance: DriverFinanceSummary.fromJson(
        json['finance'] as Map<String, dynamic>,
      ),
      duplicateRequest: json['duplicateRequest'] as bool? ?? false,
    );
  }

  final String id;
  final int amountCents;
  final String status;
  final DriverFinanceSummary finance;
  final bool duplicateRequest;
}


class DriverProfileSnapshot {
  const DriverProfileSnapshot({
    required this.driverId,
    this.phoneE164,
    this.email,
    this.fullName,
    this.preferredName,
    this.profileStatus,
    this.photoPath,
    this.ratingAverage,
    this.ratingCount = 0,
    this.vehicleId,
    this.vehiclePlate,
    this.vehicleMake,
    this.vehicleModel,
    this.vehicleYear,
    this.vehicleColor,
    this.vehicleStatus,
    this.vehicleCategories = const [],
    this.vehicleFourByFour = false,
    this.vehicleSeatCapacity,
  });

  factory DriverProfileSnapshot.fromJson(Map<String, dynamic> json) {
    final profile = json['profile'];
    final vehicle = json['vehicle'];
    final profileMap =
        profile is Map<String, dynamic> ? profile : <String, dynamic>{};
    final vehicleMap =
        vehicle is Map<String, dynamic> ? vehicle : <String, dynamic>{};
    final categories = vehicleMap['categories'];

    return DriverProfileSnapshot(
      driverId: json['driverId'] as String,
      phoneE164: json['phoneE164'] as String?,
      email: json['email'] as String?,
      fullName: profileMap['fullName'] as String?,
      preferredName: profileMap['preferredName'] as String?,
      profileStatus: profileMap['status'] as String?,
      photoPath: profileMap['photoPath'] as String?,
      ratingAverage: (profileMap['ratingAverage'] as num?)?.toDouble(),
      ratingCount: (profileMap['ratingCount'] as num?)?.toInt() ?? 0,
      vehicleId: vehicleMap['id'] as String?,
      vehiclePlate: vehicleMap['plateNormalized'] as String?,
      vehicleMake: vehicleMap['make'] as String?,
      vehicleModel: vehicleMap['model'] as String?,
      vehicleYear: (vehicleMap['modelYear'] as num?)?.toInt(),
      vehicleColor: vehicleMap['color'] as String?,
      vehicleStatus: vehicleMap['status'] as String?,
      vehicleCategories: categories is List
          ? categories.whereType<String>().toList(growable: false)
          : const [],
      vehicleFourByFour: vehicleMap['fourByFour'] as bool? ?? false,
      vehicleSeatCapacity:
          (vehicleMap['seatCapacity'] as num?)?.toInt(),
    );
  }

  final String driverId;
  final String? phoneE164;
  final String? email;
  final String? fullName;
  final String? preferredName;
  final String? profileStatus;
  final String? photoPath;
  final double? ratingAverage;
  final int ratingCount;
  final String? vehicleId;
  final String? vehiclePlate;
  final String? vehicleMake;
  final String? vehicleModel;
  final int? vehicleYear;
  final String? vehicleColor;
  final String? vehicleStatus;
  final List<String> vehicleCategories;
  final bool vehicleFourByFour;
  final int? vehicleSeatCapacity;

  String get displayName =>
      preferredName?.trim().isNotEmpty == true
          ? preferredName!.trim()
          : fullName?.trim().isNotEmpty == true
              ? fullName!.trim()
              : 'Motorista Ramo Nessa';

  String get vehicleLabel {
    final parts = [
      if (vehicleMake?.trim().isNotEmpty == true) vehicleMake!.trim(),
      if (vehicleModel?.trim().isNotEmpty == true) vehicleModel!.trim(),
      if (vehicleYear != null) vehicleYear.toString(),
    ];
    return parts.isEmpty ? 'Veículo cadastrado' : parts.join(' ');
  }
}

class DriverDocumentItem {
  const DriverDocumentItem({
    required this.id,
    required this.documentType,
    required this.status,
    required this.effectiveStatus,
    required this.mimeType,
    required this.sizeBytes,
    required this.submittedAt,
    required this.updatedAt,
    this.expiresOn,
    this.rejectionReason,
    this.reviewedAt,
  });

  factory DriverDocumentItem.fromJson(Map<String, dynamic> json) {
    return DriverDocumentItem(
      id: json['id'] as String,
      documentType: json['documentType'] as String,
      status: json['status'] as String,
      effectiveStatus:
          json['effectiveStatus'] as String? ?? json['status'] as String,
      mimeType: json['mimeType'] as String,
      sizeBytes: (json['sizeBytes'] as num).toInt(),
      expiresOn: json['expiresOn'] as String?,
      rejectionReason: json['rejectionReason'] as String?,
      submittedAt: DateTime.parse(json['submittedAt'] as String),
      reviewedAt: json['reviewedAt'] == null
          ? null
          : DateTime.parse(json['reviewedAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  final String id;
  final String documentType;
  final String status;
  final String effectiveStatus;
  final String mimeType;
  final int sizeBytes;
  final String? expiresOn;
  final String? rejectionReason;
  final DateTime submittedAt;
  final DateTime? reviewedAt;
  final DateTime updatedAt;

  String get title => switch (documentType) {
        'driver_license' => 'CNH',
        'vehicle_registration' => 'CRLV',
        _ => documentType,
      };

  String get statusLabel => switch (effectiveStatus) {
        'approved' => 'Aprovado',
        'pending' => 'Em análise',
        'rejected' => 'Rejeitado',
        'expired' => 'Vencido',
        _ => effectiveStatus,
      };
}

class DriverDocumentsSnapshot {
  const DriverDocumentsSnapshot({
    required this.items,
    required this.requiredDocumentTypes,
    required this.documentsApproved,
  });

  factory DriverDocumentsSnapshot.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
    final rawRequired = json['requiredDocumentTypes'];
    return DriverDocumentsSnapshot(
      items: rawItems is List
          ? rawItems
              .whereType<Map<String, dynamic>>()
              .map(DriverDocumentItem.fromJson)
              .toList(growable: false)
          : const [],
      requiredDocumentTypes: rawRequired is List
          ? rawRequired.whereType<String>().toList(growable: false)
          : const [],
      documentsApproved: json['documentsApproved'] as bool? ?? false,
    );
  }

  final List<DriverDocumentItem> items;
  final List<String> requiredDocumentTypes;
  final bool documentsApproved;

  DriverDocumentItem? byType(String type) {
    for (final item in items) {
      if (item.documentType == type) return item;
    }
    return null;
  }
}


class DriverSecuritySnapshot {
  const DriverSecuritySnapshot({
    required this.sessionId,
    required this.subjectType,
    required this.createdAt,
    required this.expiresAt,
  });

  factory DriverSecuritySnapshot.fromJson(Map<String, dynamic> json) {
    return DriverSecuritySnapshot(
      sessionId: json['id'] as String,
      subjectType: json['subjectType'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );
  }

  final String sessionId;
  final String subjectType;
  final DateTime createdAt;
  final DateTime expiresAt;
}

class DriverSessionRevokeResult {
  const DriverSessionRevokeResult({
    required this.revokedSessions,
    required this.disabledDevices,
  });

  factory DriverSessionRevokeResult.fromJson(Map<String, dynamic> json) {
    return DriverSessionRevokeResult(
      revokedSessions: (json['revokedSessions'] as num?)?.toInt() ?? 0,
      disabledDevices: (json['disabledDevices'] as num?)?.toInt() ?? 0,
    );
  }

  final int revokedSessions;
  final int disabledDevices;
}


class DriverSupportTicket {
  const DriverSupportTicket({
    required this.id,
    required this.category,
    required this.subject,
    required this.message,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.response,
    this.respondedAt,
  });

  factory DriverSupportTicket.fromJson(Map<String, dynamic> json) {
    return DriverSupportTicket(
      id: json['id'] as String,
      category: json['category'] as String,
      subject: json['subject'] as String,
      message: json['message'] as String,
      status: json['status'] as String,
      response: json['response'] as String?,
      respondedAt: json['respondedAt'] == null
          ? null
          : DateTime.parse(json['respondedAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  final String id;
  final String category;
  final String subject;
  final String message;
  final String status;
  final String? response;
  final DateTime? respondedAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  String get categoryLabel => switch (category) {
        'ride' => 'Corrida',
        'payment' => 'Pagamento',
        'account' => 'Conta',
        'document' => 'Documentos',
        _ => 'Outro',
      };

  String get statusLabel => switch (status) {
        'open' => 'Aberto',
        'in_progress' => 'Em atendimento',
        'resolved' => 'Resolvido',
        'closed' => 'Encerrado',
        _ => status,
      };
}

class DriverSupportSnapshot {
  const DriverSupportSnapshot({required this.tickets});

  factory DriverSupportSnapshot.fromJson(Map<String, dynamic> json) {
    final raw = json['tickets'];
    return DriverSupportSnapshot(
      tickets: raw is List
          ? raw
              .whereType<Map<String, dynamic>>()
              .map(DriverSupportTicket.fromJson)
              .toList(growable: false)
          : const [],
    );
  }

  final List<DriverSupportTicket> tickets;
}


class DriverActivityRide {
  const DriverActivityRide({
    required this.id,
    required this.state,
    required this.category,
    required this.origin,
    required this.destination,
    required this.driverEarningsCents,
    required this.totalAmountCents,
    required this.platformFeeCents,
    required this.updatedAt,
    this.paymentMethod,
  });

  factory DriverActivityRide.fromJson(Map<String, dynamic> json) {
    return DriverActivityRide(
      id: json['id'] as String,
      state: json['state'] as String,
      category: json['category'] as String,
      origin: DriverLocationRef.fromJson(
        json['origin'] as Map<String, dynamic>,
      ),
      destination: DriverLocationRef.fromJson(
        json['destination'] as Map<String, dynamic>,
      ),
      driverEarningsCents:
          (json['driverEarningsCents'] as num).toInt(),
      totalAmountCents:
          (json['totalAmountCents'] as num?)?.toInt() ?? 0,
      platformFeeCents:
          (json['platformFeeCents'] as num?)?.toInt() ?? 0,
      paymentMethod: json['paymentMethod'] as String?,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  final String id;
  final String state;
  final String category;
  final DriverLocationRef origin;
  final DriverLocationRef destination;
  final int driverEarningsCents;
  final int totalAmountCents;
  final int platformFeeCents;
  final String? paymentMethod;
  final DateTime updatedAt;

  String get stateLabel => switch (state) {
        'COMPLETED' => 'Concluída',
        'CANCELLED_BY_PASSENGER' => 'Cancelada pelo passageiro',
        'CANCELLED_BY_DRIVER' => 'Cancelada pelo motorista',
        'CANCELLED_BY_ADMIN' => 'Cancelada pelo suporte',
        'IN_PROGRESS' => 'Em andamento',
        'DRIVER_ARRIVED' => 'No embarque',
        'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' => 'A caminho',
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

class DriverActivitySnapshot {
  const DriverActivitySnapshot({
    required this.total,
    required this.completed,
    required this.cancelled,
    required this.inProgress,
    required this.earningsCents,
    required this.grossCents,
    required this.platformFeeCents,
    required this.averageEarningsCents,
    required this.payoutsRequestedCents,
    required this.payoutsPaidCents,
    required this.availableBalanceCents,
    required this.rides,
  });

  factory DriverActivitySnapshot.fromJson(Map<String, dynamic> json) {
    final summary = json['summary'] as Map<String, dynamic>? ??
        const <String, dynamic>{};
    final rides = json['rides'];
    return DriverActivitySnapshot(
      total: (summary['total'] as num?)?.toInt() ?? 0,
      completed: (summary['completed'] as num?)?.toInt() ?? 0,
      cancelled: (summary['cancelled'] as num?)?.toInt() ?? 0,
      inProgress: (summary['inProgress'] as num?)?.toInt() ?? 0,
      earningsCents:
          (summary['earningsCents'] as num?)?.toInt() ?? 0,
      grossCents:
          (summary['grossCents'] as num?)?.toInt() ?? 0,
      platformFeeCents:
          (summary['platformFeeCents'] as num?)?.toInt() ?? 0,
      averageEarningsCents:
          (summary['averageEarningsCents'] as num?)?.toInt() ?? 0,
      payoutsRequestedCents:
          (summary['payoutsRequestedCents'] as num?)?.toInt() ?? 0,
      payoutsPaidCents:
          (summary['payoutsPaidCents'] as num?)?.toInt() ?? 0,
      availableBalanceCents:
          (summary['availableBalanceCents'] as num?)?.toInt() ?? 0,
      rides: rides is List
          ? rides
              .whereType<Map<String, dynamic>>()
              .map(DriverActivityRide.fromJson)
              .toList(growable: false)
          : const [],
    );
  }

  final int total;
  final int completed;
  final int cancelled;
  final int inProgress;
  final int earningsCents;
  final int grossCents;
  final int platformFeeCents;
  final int averageEarningsCents;
  final int payoutsRequestedCents;
  final int payoutsPaidCents;
  final int availableBalanceCents;
  final List<DriverActivityRide> rides;
}


class NearbyDriverPosition {
  const NearbyDriverPosition({
    required this.latitude,
    required this.longitude,
    required this.busy,
    required this.locationAgeSeconds,
  });

  factory NearbyDriverPosition.fromJson(Map<String, dynamic> json) {
    return NearbyDriverPosition(
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      busy: json['busy'] as bool? ?? false,
      locationAgeSeconds:
          (json['locationAgeSeconds'] as num?)?.toInt() ?? 0,
    );
  }

  final double latitude;
  final double longitude;
  final bool busy;
  final int locationAgeSeconds;
}

class NearbyDriversSnapshot {
  const NearbyDriversSnapshot({
    required this.enabled,
    required this.refreshAfterSeconds,
    required this.drivers,
  });

  factory NearbyDriversSnapshot.fromJson(Map<String, dynamic> json) {
    final raw=json['drivers'];
    return NearbyDriversSnapshot(
      enabled: json['enabled'] as bool? ?? false,
      refreshAfterSeconds:
          (json['refreshAfterSeconds'] as num?)?.toInt() ?? 30,
      drivers: raw is List
          ? raw
              .whereType<Map<String,dynamic>>()
              .map(NearbyDriverPosition.fromJson)
              .toList(growable:false)
          : const [],
    );
  }

  final bool enabled;
  final int refreshAfterSeconds;
  final List<NearbyDriverPosition> drivers;
}
