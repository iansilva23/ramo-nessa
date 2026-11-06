import 'dart:js_interop';
@JS('document') external _Document get _document;
extension type _Document(JSObject _) implements JSObject {
  external _Element createElement(String tag);
  external _Element get body;
}
extension type _Element(JSObject _) implements JSObject {
  external set className(String value);
  external void appendChild(_Element child);
  external void remove();
  external void dispatchEvent(JSObject event);
}
@JS('PointerEvent')
extension type _PointerEvent._(JSObject _) implements JSObject {
  external factory _PointerEvent(String type, JSObject options);
}
@JS('WheelEvent')
extension type _WheelEvent._(JSObject _) implements JSObject {
  external factory _WheelEvent(String type, JSObject options);
}
extension type _Options._(JSObject _) implements JSObject {
  external factory _Options({int? pointerId,bool? bubbles});
}
class MapGestureFixture {
  final _map=_document.createElement('div'), _other=_document.createElement('button');
  MapGestureFixture(){_map.className='gm-style';_document.body.appendChild(_map);_document.body.appendChild(_other);}
  void pointer(String type,{bool map=true})=>(map?_map:_other).dispatchEvent(_PointerEvent(type,_Options(pointerId:1,bubbles:true)));
  void wheel()=>_map.dispatchEvent(_WheelEvent('wheel',_Options(bubbles:true)));
  void dispose(){_map.remove();_other.remove();}
}
