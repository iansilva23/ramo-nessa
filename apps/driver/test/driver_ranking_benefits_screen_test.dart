import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/benefits/data/driver_benefits_api.dart';
import 'package:ramo_nessa_driver/src/features/benefits/domain/driver_benefits_models.dart';
import 'package:ramo_nessa_driver/src/features/profile/presentation/driver_ranking_benefits_screen.dart';

import 'helpers/driver_benefits_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final root = Platform.environment['FLUTTER_ROOT'];
    if (root == null) return;
    final font = File('$root/bin/cache/artifacts/material_fonts/Roboto-Regular.ttf');
    if (!await font.exists()) return;
    final bytes = await font.readAsBytes();
    await (FontLoader('Roboto')..addFont(Future.value(ByteData.sublistView(bytes)))).load();
  });
  testWidgets('ranking e beneficios aparece apenas como em breve', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: DriverRankingBenefitsScreen(),
      ),
    );

    expect(find.text('Ranking & Benefícios'), findsWidgets);
    expect(find.text('EM BREVE'), findsOneWidget);
    expect(find.text('Seu destaque vai valer ainda mais.'), findsOneWidget);
    expect(
      find.textContaining('categoria e região'),
      findsWidgets,
    );

    expect(find.textContaining('Pagar'), findsNothing);
    expect(find.textContaining('Sacar'), findsNothing);
  });

  testWidgets('módulo OFF e nenhuma campanha mantêm Em breve', (tester) async {
    for (final snapshot in [
      DriverBenefitsSnapshot(enabled: false, campaigns: [DriverBenefitCampaign.fromJson(benefitCampaignJson())]),
      const DriverBenefitsSnapshot(enabled: true),
    ]) {
      final api = _BenefitsApi(snapshot: snapshot);
      await _mount(tester, api);
      expect(find.text('EM BREVE'), findsOneWidget);
      expect(find.byKey(const ValueKey('benefits-my-points')), findsNothing);
      expect(api.calls, 1);
      await tester.pumpWidget(const SizedBox.shrink());
    }
  });

  testWidgets('campanha real mostra posição, pontos, tempo, diferença e pódio', (tester) async {
    tester.view.physicalSize = const Size(390, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await _mount(tester, _BenefitsApi(snapshot: _snapshot()));
    expect(find.text('Destaques Mototáxi — Preá'), findsOneWidget);
    expect(find.text('#4'), findsWidgets);
    expect(find.text('2.840 pts'), findsWidgets);
    expect(find.text('Faltam 170 pontos para #3'), findsOneWidget);
    expect(find.textContaining('dias restantes'), findsOneWidget);
    for (final rank in [1, 2, 3]) expect(find.byKey(ValueKey('benefits-podium-$rank')), findsOneWidget);
    expect(find.text('Ana S.'), findsWidgets);
    expect(find.textContaining('Ana Souza'), findsNothing);
    expect(find.text('EM BREVE'), findsNothing);
    await _capture(tester, 'ranking-mobile');
  });

  testWidgets('posição própria, detalhamento, missões e prêmio são informativos', (tester) async {
    await _mount(tester, _BenefitsApi(snapshot: _snapshot()));
    await _scrollTo(tester, find.byKey(const ValueKey('benefits-rank-4')));
    expect(find.text('Você · Bruno C.'), findsOneWidget);
    await _scrollTo(tester, find.text('Seus pontos, sem mistério'));
    expect(find.text('+2.460 pts'), findsOneWidget);
    await _scrollTo(tester, find.text('Complete 200 corridas'));
    expect(find.text('123 / 200 · +200 pts'), findsOneWidget);
    await _scrollTo(tester, find.textContaining('36 / 10'));
    expect(find.textContaining('Concluída'), findsOneWidget);
    await _capture(tester, 'ranking-missions');
    await _scrollTo(tester, find.text('R\$ 500 via Pix'));
    expect(find.text('Premiação para o Top 3'), findsOneWidget);
    expect(find.textContaining('eventual pagamento'), findsOneWidget);
    expect(find.text('Receber Pix'), findsNothing);
    expect(find.text('Sacar'), findsNothing);
  });

  testWidgets('mínimo de participantes insuficiente mantém aviso explícito', (tester) async {
    final campaign = { ...benefitCampaignJson(), 'minParticipants': 10, 'prizesUnlocked': false };
    await _mount(tester, _BenefitsApi(snapshot: DriverBenefitsSnapshot.fromJson(benefitSnapshotJson(campaigns: [campaign]))));
    await _scrollTo(tester, find.textContaining('Premiação ainda não liberada'));
    expect(find.textContaining('5 de 10 participantes'), findsOneWidget);
  });

  testWidgets('motorista pode alternar entre campanhas independentes', (tester) async {
    final second = { ...benefitCampaignJson(id: 'car-jijoca', name: 'Destaques Carro — Jijoca'), 'category': 'car' };
    final api = _BenefitsApi(snapshot: DriverBenefitsSnapshot.fromJson(benefitSnapshotJson(campaigns: [benefitCampaignJson(), second])));
    await _mount(tester, api);
    await tester.tap(find.byKey(const ValueKey('benefits-campaign-selector')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Destaques Carro — Jijoca').last);
    await tester.pumpAndSettle();
    expect(find.text('Destaques Carro — Jijoca'), findsWidgets);
    expect(find.text('Carro'), findsOneWidget);
    expect(api.calls, 1);
  });

  testWidgets('erro de rede não vira Em breve e permite tentar novamente', (tester) async {
    final api = _BenefitsApi(fetch: (call) async {
      if (call == 1) throw Exception('network unavailable');
      return _snapshot();
    });
    await _mount(tester, api);
    expect(find.textContaining('Confira sua conexão'), findsOneWidget);
    expect(find.text('EM BREVE'), findsNothing);
    await tester.tap(find.text('Tentar novamente'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('benefits-my-points')), findsOneWidget);
    expect(api.calls, 2);
  });

  testWidgets('histórico permanece disponível sem campanha ativa', (tester) async {
    final api = _BenefitsApi(snapshot: DriverBenefitsSnapshot.fromJson(benefitSnapshotJson(campaigns: [], history: true)));
    await _mount(tester, api);
    expect(find.text('EM BREVE'), findsOneWidget);
    await _scrollTo(tester, find.text('Destaques de Setembro'));
    await tester.tap(find.text('Destaques de Setembro'));
    await tester.pumpAndSettle();
    await _scrollTo(tester, find.text('Sua posição #2 · 3.600 pts'));
    expect(find.textContaining('Destaques · Top 2'), findsOneWidget);
    expect(find.textContaining('Ana S.'), findsOneWidget);
  });

  testWidgets('resposta da sessão anterior não sobrescreve o módulo OFF', (tester) async {
    final pending = Completer<DriverBenefitsSnapshot>();
    final oldApi = _BenefitsApi(fetch: (_) => pending.future);
    await tester.pumpWidget(_app(oldApi));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    final newApi = _BenefitsApi(snapshot: const DriverBenefitsSnapshot(enabled: false));
    await tester.pumpWidget(_app(newApi));
    await tester.pumpAndSettle();
    pending.complete(_snapshot());
    await tester.pumpAndSettle();
    expect(find.text('EM BREVE'), findsOneWidget);
    expect(find.byKey(const ValueKey('benefits-my-points')), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('refresh aplica OFF e apaga a classificação antes exibida', (tester) async {
    final api = _BenefitsApi(fetch: (call) async => call == 1 ? _snapshot() : const DriverBenefitsSnapshot(enabled: false));
    await _mount(tester, api);
    await tester.tap(find.byTooltip('Atualizar ranking'));
    await tester.pumpAndSettle();
    expect(find.text('EM BREVE'), findsOneWidget);
    expect(find.textContaining('2.840'), findsNothing);
    expect(api.calls, 2);
  });

  testWidgets('layout pequeno com fonte ampliada conserva controles e pódio', (tester) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await _mount(tester, _BenefitsApi(snapshot: _snapshot()), scale: 1.6);
    expect(tester.takeException(), isNull);
    await _scrollTo(tester, find.byKey(const ValueKey('benefits-podium-1')));
    expect(tester.takeException(), isNull);
    await _capture(tester, 'ranking-small-large-font');
    await _scrollTo(tester, find.text('R\$ 500 via Pix'));
    expect(tester.takeException(), isNull);
  });

  testWidgets('resposta após fechar tela não causa setState em widget descartado', (tester) async {
    final pending = Completer<DriverBenefitsSnapshot>();
    await tester.pumpWidget(_app(_BenefitsApi(fetch: (_) => pending.future)));
    await tester.pumpWidget(const SizedBox.shrink());
    pending.complete(_snapshot());
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}

DriverBenefitsSnapshot _snapshot() => DriverBenefitsSnapshot.fromJson(benefitSnapshotJson());
final _now = DateTime.utc(2026, 10, 10, 12);
const _captureKey = ValueKey('benefits-visual-boundary');

Widget _app(DriverBenefitsApi api, {double scale = 1}) => RepaintBoundary(
  key: _captureKey,
  child: MaterialApp(
    builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
    home: DriverRankingBenefitsScreen(api: api, clock: () => _now),
  ),
);

Future<void> _mount(WidgetTester tester, DriverBenefitsApi api, {double scale = 1}) async {
  addTearDown(() async { await tester.pumpWidget(const SizedBox.shrink()); });
  await tester.pumpWidget(_app(api, scale: scale));
  await tester.pumpAndSettle();
}

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 180, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}

Future<void> _capture(WidgetTester tester, String name) async {
  final directory = Platform.environment['RUNNER_TEMP'];
  if (directory == null) return;
  final boundary = tester.renderObject<RenderRepaintBoundary>(find.byKey(_captureKey));
  await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    if (bytes == null) throw StateError('Falha ao renderizar o ranking.');
    final folder = Directory('$directory/driver-benefits-visuals');
    await folder.create(recursive: true);
    await File('${folder.path}/$name.png').writeAsBytes(bytes.buffer.asUint8List());
    image.dispose();
  });
}

class _BenefitsApi implements DriverBenefitsApi {
  _BenefitsApi({this.snapshot, this.fetch});
  final DriverBenefitsSnapshot? snapshot;
  final Future<DriverBenefitsSnapshot> Function(int)? fetch;
  int calls = 0;

  @override
  Future<DriverBenefitsSnapshot> benefits() {
    calls++;
    return fetch?.call(calls) ?? Future.value(snapshot!);
  }
}
