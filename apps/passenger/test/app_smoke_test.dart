import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/app.dart';

void main() {
  testWidgets('home exibe serviços principais', (tester) async {
    await tester.pumpWidget(const RamoNessaPassengerApp());
    await tester.pump();

    expect(find.text('Ramo Nessa'), findsOneWidget);
    expect(find.text('Pra onde vamos?'), findsOneWidget);
    expect(find.text('Carro'), findsOneWidget);
    expect(find.text('Moto'), findsOneWidget);
    expect(find.text('Entrega'), findsOneWidget);
  });
}
