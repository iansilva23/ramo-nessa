import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pointer_interceptor/pointer_interceptor.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

void main() {
  testWidgets('native path has no interceptor and preserves button behavior', (tester) async {
    var taps = 0;
    await tester.pumpWidget(MaterialApp(home: Center(child: RamoWebMapOverlay(
      child: SizedBox(width: 48, height: 48, child: IconButton(
        onPressed: () => taps++, icon: const Icon(Icons.person),
      )),
    ))));
    expect(find.byType(PointerInterceptor), findsNothing);
    expect(tester.getSize(find.byType(RamoWebMapOverlay)), const Size(48, 48));
    await tester.tap(find.byIcon(Icons.person));
    expect(taps, 1);
  });
}
