class SharedTransferOption {
  const SharedTransferOption({required this.label, required this.url});
  final String label;
  final Uri url;

  static SharedTransferOption? forRoute({
    required dynamic settings,
    required String originId,
    required String destinationId,
    required String originLabel,
    required String destinationLabel,
  }) {
    if (settings is! Map || settings['enabled'] != true) return null;
    final phone = settings['whatsappPhone']?.toString() ?? '';
    final label = settings['buttonLabel']?.toString().trim() ?? '';
    final template = settings['messageTemplate']?.toString() ?? '';
    final routes = settings['routes'];
    if (!RegExp(r'^[1-9][0-9]{7,14}$').hasMatch(phone) || label.isEmpty || routes is! List) return null;
    final allowed = routes.whereType<Map>().any((route) => route['enabled'] == true &&
      route['originId'] == originId && route['destinationId'] == destinationId);
    if (!allowed) return null;
    final message = template.replaceAll('{origem}', originLabel).replaceAll('{destino}', destinationLabel);
    return SharedTransferOption(label: label, url: Uri.https('wa.me', '/$phone', {'text': message}));
  }
}
