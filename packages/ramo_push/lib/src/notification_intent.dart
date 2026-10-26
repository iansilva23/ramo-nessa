import 'dart:async';

/// A notification is only a hint. Screens must reload authenticated state;
/// no payment, acceptance or trip action is ever performed from its payload.
class RamoNotificationIntent {
  const RamoNotificationIntent({required this.type, this.rideId, this.title, this.body, this.foreground = false});
  final String type;
  final String? rideId, title, body;
  final bool foreground;
  bool get isRide => type.startsWith('driver.offer.') || type.startsWith('driver.ride.') || type.startsWith('passenger.ride.') || type.startsWith('ride.chat.');
}
final _intents = StreamController<RamoNotificationIntent>.broadcast(sync: true);
RamoNotificationIntent? _pending;
final _seen = <String>{};
Stream<RamoNotificationIntent> get ramoNotificationIntents => _intents.stream;
RamoNotificationIntent? takePendingNotificationIntent() {final value = _pending; _pending = null; return value;}
void clearNotificationIntents() {_pending = null; _seen.clear();}
void publishNotificationIntent(Map<String, dynamic> data, {String? messageId, String? title, String? body, bool foreground = false}) {
  final type = data['type'];
  if (type is! String || !RegExp(r'^[a-z][a-z0-9_.]{1,100}$').hasMatch(type)) return;
  if (messageId != null && !_seen.add(messageId)) return;
  if (_seen.length > 100) _seen.remove(_seen.first);
  final rawId = data['rideId'];
  final id = rawId is String && RegExp(r'^[0-9a-fA-F-]{36}$').hasMatch(rawId) ? rawId : null;
  final intent = RamoNotificationIntent(type:type,rideId:id,title:title,body:body,foreground:foreground);
  if (_intents.hasListener) {_intents.add(intent);} else if (!foreground) {_pending = intent;}
}
