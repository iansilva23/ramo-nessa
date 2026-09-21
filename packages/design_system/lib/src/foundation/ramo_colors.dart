import 'package:flutter/material.dart';

/// Paleta oficial do Ramo Nessa.
///
/// A identidade usa amarelo/dourado e preto como assinatura. Os neutros
/// continuam predominando nas telas para preservar legibilidade e deixar o
/// amarelo funcionar como cor de ação, seleção e momentos de marca.
abstract final class RamoColors {
  static const brandYellow = Color(0xFFFAD50E);
  static const brandYellowLight = Color(0xFFFFF21A);
  static const brandGold = Color(0xFFF6BF09);
  static const brandBlack = Color(0xFF0D0D0D);

  static const ink = Color(0xFF111315);
  static const inkSoft = Color(0xFF383B40);
  static const muted = Color(0xFF74787F);

  static const canvas = Color(0xFFF5F5F1);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceRaised = Color(0xFFFAFAF7);
  static const border = Color(0xFFE4E5E1);

  static const darkCanvas = Color(0xFF0D0F11);
  static const darkSurface = Color(0xFF16191C);
  static const darkRaised = Color(0xFF1D2024);
  static const darkBorder = Color(0xFF2A2E33);

  static const signal = brandYellow;
  static const signalInk = brandBlack;

  static const success = Color(0xFF16845B);
  static const warning = Color(0xFFE5A11A);
  static const danger = Color(0xFFD94B55);
  static const info = Color(0xFF4178F2);

  static const mapRoad = Color(0xFFFFFFFF);
  static const mapLand = Color(0xFFEDEDE7);
  static const mapWater = Color(0xFFD8EAF2);
  static const mapPark = Color(0xFFD8E8D2);
}
