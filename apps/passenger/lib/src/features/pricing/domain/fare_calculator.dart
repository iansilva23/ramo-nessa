@Deprecated(
  'O preço comercial v1 é autoritativo no Ramo Nessa Core. '
  'Use PricingQuoteService.',
)
abstract final class FareCalculator {
  static Never estimate() {
    throw UnsupportedError(
      'FareCalculator local foi removido. Solicite a cotação ao Ramo Nessa Core.',
    );
  }
}
