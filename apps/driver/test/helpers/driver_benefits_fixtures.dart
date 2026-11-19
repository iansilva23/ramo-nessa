Map<String, dynamic> benefitCampaignJson({String id = 'moto-prea', String name = 'Destaques Mototáxi — Preá'}) => {
  'id': id, 'name': name, 'category': 'moto',
  'startsAt': '2026-10-01T00:00:00.000Z', 'endsAt': '2026-11-01T00:00:00.000Z',
  'topCount': 3, 'minParticipants': 5, 'participantCount': 5, 'prizesUnlocked': true,
  'leaderboard': [
    benefitEntryJson(1, 'Ana Souza', 3640), benefitEntryJson(2, 'Carlos Lima', 3250),
    benefitEntryJson(3, 'João Silva', 3010), benefitEntryJson(4, 'Bruno Costa', 2840, isMe: true),
    benefitEntryJson(5, 'Marina Santos', 2440),
  ],
  'me': {
    'rank': 4, 'points': 2840, 'completedRides': 123, 'fiveStarRatings': 36,
    'fourStarRatings': 10, 'ratingAverage': 4.8, 'cancellationRateBps': 0, 'gapToNextPoints': 170,
    'breakdown': { 'ridePoints': 2460, 'fiveStarPoints': 180, 'fourStarPoints': 20,
      'lowCancellationBonusPoints': 100, 'missionPoints': 80 },
    'missions': [
      { 'id': 'rides-200', 'title': 'Complete 200 corridas', 'kind': 'completed_rides',
        'target': 200, 'current': 123, 'bonusPoints': 200, 'completed': false },
      { 'id': 'stars-10', 'title': 'Receba 10 avaliações 5 estrelas', 'kind': 'five_star_ratings',
        'target': 10, 'current': 36, 'bonusPoints': 80, 'completed': true },
    ],
  },
  'prizes': [ { 'rank': 1, 'label': 'R\$ 500 via Pix' }, { 'rank': 2, 'label': 'Capacete' }, { 'rank': 3, 'label': 'Kit Ramo Nessa' } ],
};

Map<String, dynamic> benefitEntryJson(int rank, String name, int points, {bool isMe = false}) => {
  'rank': rank, 'displayName': name, 'points': points, 'completedRides': 123, 'ratingAverage': 4.8, 'isMe': isMe,
};

Map<String, dynamic> benefitHistoryJson() => {
  'id': 'finished-september', 'name': 'Destaques de Setembro', 'category': 'moto',
  'endsAt': '2026-09-30T23:59:00.000Z', 'topCount': 2, 'minParticipants': 5,
  'participantCount': 5, 'prizesUnlocked': true, 'me': { 'rank': 2, 'points': 3600 },
  'winners': [benefitEntryJson(1, 'Ana Souza', 4000), benefitEntryJson(2, 'Bruno Costa', 3600, isMe: true)],
  'prizes': [{ 'rank': 1, 'label': 'Capacete' }],
};

Map<String, dynamic> benefitSnapshotJson({List<Map<String, dynamic>>? campaigns, bool history = false}) => {
  'enabled': true, 'campaigns': campaigns ?? [benefitCampaignJson()],
  'history': history ? [benefitHistoryJson()] : [],
};
