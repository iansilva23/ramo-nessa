void Function() subscribeDriverMapGestures({
  required void Function() down,
  required void Function() move,
  required void Function() up,
  required void Function() wheel,
  bool Function()? beginPinch,
  void Function(double zoomDelta, double bearingDelta)? pinch,
  void Function()? endPinch,
}) => () {};
