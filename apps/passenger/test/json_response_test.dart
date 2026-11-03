import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/core/network/json_response.dart';

void main() {
  test('decodeJsonObject rejeita corpo vazio, quebrado e não-objeto', () {
    expect(decodeJsonObject(''), isNull);
    expect(decodeJsonObject('<html>erro</html>'), isNull);
    expect(decodeJsonObject('[1,2,3]'), isNull);
  });

  test('apiErrorMessage só usa mensagem textual válida', () {
    expect(
      apiErrorMessage(
        decodeJsonObject('{"message":"  tente novamente  "}'),
        'fallback',
      ),
      'tente novamente',
    );
    expect(
      apiErrorMessage(decodeJsonObject('{"message":123}'), 'fallback'),
      'fallback',
    );
  });
}
