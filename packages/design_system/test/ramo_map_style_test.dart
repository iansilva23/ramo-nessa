import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

void main() {
  for (final entry in <String, String>{
    'light': ramoLightMapStyle,
    'dark': ramoDarkMapStyle,
  }.entries) {
    test('${entry.key} map hides default points of interest, keeps street names', () {
      final rules = (jsonDecode(entry.value) as List).cast<Map<String, dynamic>>();
      Map<String, dynamic> rule(String feature, String? element) =>
          rules.firstWhere(
            (item) =>
                item['featureType'] == feature &&
                item['elementType'] == element,
          );
      bool visibility(Map<String, dynamic> style, String expected) =>
          (style['stylers'] as List).any(
            (item) => (item as Map)['visibility'] == expected,
          );
      // The whole POI feature must be hidden, not only its text labels.
      expect(visibility(rule('poi', null), 'off'), isTrue);
      expect(visibility(rule('poi', 'labels'), 'off'), isTrue);
      expect(visibility(rule('transit', 'labels'), 'off'), isTrue);
      expect(visibility(rule('administrative', 'labels'), 'off'), isTrue);
      expect(visibility(rule('road', 'labels.text'), 'on'), isTrue);
    });
  }

  test('night palette remains configured alongside the POI suppression', () {
    final rules = (jsonDecode(ramoDarkMapStyle) as List)
        .cast<Map<String, dynamic>>();
    expect(rules.any((item) => item['featureType'] == 'water'), isTrue);
    expect(rules.any((item) => item['featureType'] == 'road' && item['elementType'] == 'geometry'), isTrue);
  });
}
