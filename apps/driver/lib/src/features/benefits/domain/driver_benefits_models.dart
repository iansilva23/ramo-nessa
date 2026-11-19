class DriverBenefitsSnapshot {
  const DriverBenefitsSnapshot({
    required this.enabled,
    this.campaigns = const [],
    this.history = const [],
  });

  factory DriverBenefitsSnapshot.fromJson(Map<String, dynamic> json) {
    final enabled = _boolean(json, 'enabled');
    // The visibility gate also applies to unexpected/stale payload fields.
    if (!enabled) return const DriverBenefitsSnapshot(enabled: false);
    return DriverBenefitsSnapshot(
      enabled: true,
      campaigns: _objects(json, 'campaigns', DriverBenefitCampaign.fromJson),
      history: _objects(json, 'history', DriverBenefitHistory.fromJson),
    );
  }

  final bool enabled;
  final List<DriverBenefitCampaign> campaigns;
  final List<DriverBenefitHistory> history;
}

class DriverBenefitCampaign {
  const DriverBenefitCampaign({
    required this.id,
    required this.name,
    required this.category,
    required this.startsAt,
    required this.endsAt,
    required this.topCount,
    required this.minParticipants,
    required this.participantCount,
    required this.prizesUnlocked,
    required this.leaderboard,
    required this.me,
    required this.prizes,
  });

  factory DriverBenefitCampaign.fromJson(Map<String, dynamic> json) =>
      DriverBenefitCampaign(
        id: _text(json, 'id'),
        name: _text(json, 'name'),
        category: _text(json, 'category'),
        startsAt: DateTime.parse(_text(json, 'startsAt')),
        endsAt: DateTime.parse(_text(json, 'endsAt')),
        topCount: _integer(json, 'topCount', minimum: 1),
        minParticipants: _integer(json, 'minParticipants', minimum: 1),
        participantCount: _integer(json, 'participantCount'),
        prizesUnlocked: _boolean(json, 'prizesUnlocked'),
        leaderboard: _objects(json, 'leaderboard', DriverBenefitRankingEntry.fromJson),
        me: DriverBenefitMe.fromJson(_object(json['me'])),
        prizes: _objects(json, 'prizes', DriverBenefitPrize.fromJson),
      );

  final String id;
  final String name;
  final String category;
  final DateTime startsAt;
  final DateTime endsAt;
  final int topCount;
  final int minParticipants;
  final int participantCount;
  final bool prizesUnlocked;
  final List<DriverBenefitRankingEntry> leaderboard;
  final DriverBenefitMe me;
  final List<DriverBenefitPrize> prizes;

  String get categoryLabel => driverBenefitCategoryLabel(category);
}

class DriverBenefitRankingEntry {
  const DriverBenefitRankingEntry({
    required this.rank,
    required this.displayName,
    required this.points,
    required this.completedRides,
    required this.ratingAverage,
    required this.isMe,
  });

  factory DriverBenefitRankingEntry.fromJson(Map<String, dynamic> json) =>
      DriverBenefitRankingEntry(
        rank: _integer(json, 'rank', minimum: 1),
        displayName: _publicName(_text(json, 'displayName')),
        points: _integer(json, 'points'),
        completedRides: _integer(json, 'completedRides'),
        ratingAverage: _rating(json),
        isMe: _boolean(json, 'isMe'),
      );

  final int rank;
  final String displayName;
  final int points;
  final int completedRides;
  final double ratingAverage;
  final bool isMe;
}

class DriverBenefitMe {
  const DriverBenefitMe({
    required this.rank,
    required this.points,
    required this.completedRides,
    required this.fiveStarRatings,
    required this.fourStarRatings,
    required this.ratingAverage,
    required this.cancellationRateBps,
    required this.gapToNextPoints,
    required this.breakdown,
    required this.missions,
  });

  factory DriverBenefitMe.fromJson(Map<String, dynamic> json) => DriverBenefitMe(
        rank: _integer(json, 'rank', minimum: 1),
        points: _integer(json, 'points'),
        completedRides: _integer(json, 'completedRides'),
        fiveStarRatings: _integer(json, 'fiveStarRatings'),
        fourStarRatings: _integer(json, 'fourStarRatings'),
        ratingAverage: _rating(json),
        cancellationRateBps: _integer(json, 'cancellationRateBps'),
        gapToNextPoints: _integer(json, 'gapToNextPoints'),
        breakdown: DriverBenefitPoints.fromJson(_object(json['breakdown'])),
        missions: _objects(json, 'missions', DriverBenefitMissionProgress.fromJson),
      );

  final int rank;
  final int points;
  final int completedRides;
  final int fiveStarRatings;
  final int fourStarRatings;
  final double ratingAverage;
  final int cancellationRateBps;
  final int gapToNextPoints;
  final DriverBenefitPoints breakdown;
  final List<DriverBenefitMissionProgress> missions;
}

class DriverBenefitPoints {
  const DriverBenefitPoints({
    required this.ridePoints,
    required this.fiveStarPoints,
    required this.fourStarPoints,
    required this.lowCancellationBonusPoints,
    required this.missionPoints,
  });

  factory DriverBenefitPoints.fromJson(Map<String, dynamic> json) =>
      DriverBenefitPoints(
        ridePoints: _integer(json, 'ridePoints'),
        fiveStarPoints: _integer(json, 'fiveStarPoints'),
        fourStarPoints: _integer(json, 'fourStarPoints'),
        lowCancellationBonusPoints: _integer(json, 'lowCancellationBonusPoints'),
        missionPoints: _integer(json, 'missionPoints'),
      );

  final int ridePoints;
  final int fiveStarPoints;
  final int fourStarPoints;
  final int lowCancellationBonusPoints;
  final int missionPoints;
}

class DriverBenefitMissionProgress {
  const DriverBenefitMissionProgress({
    required this.id,
    required this.title,
    required this.kind,
    required this.target,
    required this.current,
    required this.bonusPoints,
    required this.completed,
  });

  factory DriverBenefitMissionProgress.fromJson(Map<String, dynamic> json) =>
      DriverBenefitMissionProgress(
        id: _text(json, 'id'),
        title: _text(json, 'title'),
        kind: _text(json, 'kind'),
        target: _integer(json, 'target', minimum: 1),
        current: _integer(json, 'current'),
        bonusPoints: _integer(json, 'bonusPoints'),
        completed: _boolean(json, 'completed'),
      );

  final String id;
  final String title;
  final String kind;
  final int target;
  final int current;
  final int bonusPoints;
  final bool completed;

  double get progress => (current / target).clamp(0.0, 1.0).toDouble();
}

class DriverBenefitPrize {
  const DriverBenefitPrize({required this.rank, required this.label});

  factory DriverBenefitPrize.fromJson(Map<String, dynamic> json) =>
      DriverBenefitPrize(rank: _integer(json, 'rank', minimum: 1), label: _text(json, 'label'));

  final int rank;
  final String label;
}

class DriverBenefitHistory {
  const DriverBenefitHistory({
    required this.id,
    required this.name,
    required this.category,
    required this.endsAt,
    required this.topCount,
    required this.minParticipants,
    required this.participantCount,
    required this.prizesUnlocked,
    required this.myRank,
    required this.myPoints,
    required this.winners,
    required this.prizes,
  });

  factory DriverBenefitHistory.fromJson(Map<String, dynamic> json) {
    final me = _object(json['me']);
    return DriverBenefitHistory(
      id: _text(json, 'id'),
      name: _text(json, 'name'),
      category: _text(json, 'category'),
      endsAt: DateTime.parse(_text(json, 'endsAt')),
      topCount: _integer(json, 'topCount', minimum: 1),
      minParticipants: _integer(json, 'minParticipants', minimum: 1),
      participantCount: _integer(json, 'participantCount'),
      prizesUnlocked: _boolean(json, 'prizesUnlocked'),
      myRank: _integer(me, 'rank', minimum: 1),
      myPoints: _integer(me, 'points'),
      winners: _objects(json, 'winners', DriverBenefitRankingEntry.fromJson),
      prizes: _objects(json, 'prizes', DriverBenefitPrize.fromJson),
    );
  }

  final String id;
  final String name;
  final String category;
  final DateTime endsAt;
  final int topCount;
  final int minParticipants;
  final int participantCount;
  final bool prizesUnlocked;
  final int myRank;
  final int myPoints;
  final List<DriverBenefitRankingEntry> winners;
  final List<DriverBenefitPrize> prizes;
}

String driverBenefitCategoryLabel(String category) => switch (category) {
      'moto' => 'Mototáxi',
      'car' => 'Carro',
      'delivery' => 'Entrega',
      'comfort_black' => 'Comfort / 4x4',
      'buggy' => 'Buggy',
      _ => category,
    };

Map<String, dynamic> _object(Object? value) {
  if (value is Map<String, dynamic>) return value;
  throw const FormatException('Resposta de Ranking & Benefícios inválida.');
}

List<T> _objects<T>(Map<String, dynamic> json, String key, T Function(Map<String, dynamic>) parse) {
  final value = json[key];
  if (value is! List) throw FormatException('Lista $key inválida.');
  return List<T>.unmodifiable(value.map((item) => parse(_object(item))));
}

String _text(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is String && value.trim().isNotEmpty) return value.trim();
  throw FormatException('Campo $key inválido.');
}

int _integer(Map<String, dynamic> json, String key, {int minimum = 0}) {
  final value = json[key];
  if (value is int && value >= minimum) return value;
  throw FormatException('Campo $key inválido.');
}

bool _boolean(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is bool) return value;
  throw FormatException('Campo $key inválido.');
}

double _rating(Map<String, dynamic> json) {
  final value = json['ratingAverage'];
  if (value is num && value.isFinite && value >= 0 && value <= 5) return value.toDouble();
  throw const FormatException('Avaliação inválida.');
}

String _publicName(String name) {
  final parts = name.split(RegExp(r'\s+'));
  if (parts.length < 2) return parts.first;
  return '${parts.first} ${parts.last[0].toUpperCase()}.';
}
