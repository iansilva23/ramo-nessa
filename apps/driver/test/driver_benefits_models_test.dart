import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/benefits/domain/driver_benefits_models.dart';

import 'helpers/driver_benefits_fixtures.dart';

void main() {
  test('OFF descarta ranking e histórico mesmo em payload inesperado', () {
    final result = DriverBenefitsSnapshot.fromJson({ ...benefitSnapshotJson(history: true), 'enabled': false });
    expect(result.enabled, isFalse);
    expect(result.campaigns, isEmpty);
    expect(result.history, isEmpty);
  });

  test('contrato real conserva pontuação, missões, prêmios e histórico', () {
    final result = DriverBenefitsSnapshot.fromJson(benefitSnapshotJson(history: true));
    final campaign = result.campaigns.single;
    expect(campaign.categoryLabel, 'Mototáxi');
    expect(campaign.me.points, 2840);
    expect(campaign.me.breakdown.missionPoints, 80);
    expect(campaign.me.missions.first.progress, closeTo(.615, .001));
    expect(campaign.me.missions.last.progress, 1);
    expect(campaign.prizes.first.label, 'R\$ 500 via Pix');
    expect(result.history.single.myRank, 2);
    expect(result.history.single.winners.length, 2);
  });

  test('somente nome público abreviado e dados do ranking são consumidos', () {
    final entry = DriverBenefitRankingEntry.fromJson({
      ...benefitEntryJson(1, 'Ana Maria Souza', 500),
      'driverId': 'private-id', 'phone': 'private-phone', 'pixKey': 'private-pix',
    });
    expect(entry.displayName, 'Ana S.');
    expect(entry.isMe, isFalse);
  });

  test('payload inválido não se transforma em pontuação fictícia ou Em breve', () {
    expect(() => DriverBenefitsSnapshot.fromJson({}), throwsFormatException);
    final campaign = benefitCampaignJson();
    (campaign['me'] as Map<String, dynamic>)['points'] = -1;
    expect(() => DriverBenefitsSnapshot.fromJson(benefitSnapshotJson(campaigns: [campaign])), throwsFormatException);
    final invalidMission = benefitCampaignJson();
    ((invalidMission['me'] as Map<String, dynamic>)['missions'] as List).first['target'] = 0;
    expect(() => DriverBenefitsSnapshot.fromJson(benefitSnapshotJson(campaigns: [invalidMission])), throwsFormatException);
  });
}
