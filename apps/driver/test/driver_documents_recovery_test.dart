import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_driver/src/features/home/data/driver_api.dart';
import 'package:ramo_nessa_driver/src/features/home/domain/driver_models.dart';
import 'package:ramo_nessa_driver/src/features/profile/presentation/driver_documents_screen.dart';

void main() {
  testWidgets('documentos mostra falha de atualização e permite nova tentativa', (tester) async {
    final api = _DocumentsApi();
    await tester.pumpWidget(MaterialApp(home: DriverDocumentsScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Documentação pendente'), findsOneWidget);
    api.fail = true;
    final refresh = tester.state<RefreshIndicatorState>(find.byType(RefreshIndicator)).show();
    await tester.pumpAndSettle();
    await refresh;
    expect(find.text('Não conseguimos carregar seus documentos agora.'), findsOneWidget);
    expect(find.text('Documentação pendente'), findsOneWidget);
    api.fail = false;
    await tester.tap(find.text('Atualizar documentos'));
    await tester.pumpAndSettle();
    expect(find.text('Não conseguimos carregar seus documentos agora.'), findsNothing);
    expect(find.text('Documentação pendente'), findsOneWidget);
  });
}

class _DocumentsApi extends Fake implements DriverApi {
  bool fail = false;
  @override
  Future<DriverDocumentsSnapshot> documents() async {
    if (fail) throw StateError('offline');
    return const DriverDocumentsSnapshot(items: [],
        requiredDocumentTypes: ['driver_license', 'vehicle_registration'], documentsApproved: false);
  }
}
