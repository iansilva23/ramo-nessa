import 'dart:js_interop';

@JS('document')
external _Document get _document;
extension type _Document(JSObject _) implements JSObject {
  external void addEventListener(String type, JSFunction handler, bool capture);
  external void removeEventListener(String type, JSFunction handler, bool capture);
}
extension type _Event(JSObject _) implements JSObject {
  external int get pointerId;
  external _Element? get target;
}
extension type _Element(JSObject _) implements JSObject {
  external _Element? closest(String selector);
}

/// Platform views can consume events before Flutter's Listener. Capture only
/// Google Map descendants, never the app's cards, buttons or other screens.
void Function() subscribeDriverMapGestures({required void Function() down,
  required void Function() move, required void Function() up,
  required void Function() wheel}) {
  final pointers = <int>{};
  final handlers = <String, JSFunction>{};
  bool isMap(_Event e) => e.target?.closest('.gm-style') != null;
  handlers['pointerdown'] = ((_Event e) { if (isMap(e) && pointers.add(e.pointerId)) down(); }).toJS;
  handlers['pointermove'] = ((_Event e) { if (pointers.contains(e.pointerId)) move(); }).toJS;
  void end(_Event e) { if (pointers.remove(e.pointerId)) up(); }
  handlers['pointerup'] = end.toJS;
  handlers['pointercancel'] = end.toJS;
  handlers['wheel'] = ((_Event e) { if (isMap(e)) wheel(); }).toJS;
  // Losing the browser window must not leave a phantom finger held forever.
  handlers['visibilitychange'] = ((_Event e) { while (pointers.isNotEmpty) { pointers.remove(pointers.first); up(); } }).toJS;
  for (final entry in handlers.entries) { _document.addEventListener(entry.key, entry.value, true); }
  return () { for (final entry in handlers.entries) { _document.removeEventListener(entry.key, entry.value, true); } pointers.clear(); };
}
