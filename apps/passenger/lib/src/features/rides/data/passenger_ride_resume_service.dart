import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class PassengerRideResumeService {
  Future<Map<String,dynamic>> resumeRide({String? lastRideId});
}
abstract interface class PassengerBoardingApi {
  Future<Map<String,dynamic>> boardingStatus(String rideId);
}
class RideRecoveryMemory {
  static const _storage=FlutterSecureStorage();
  static const _key='ramo_passenger_last_ride_v1';
  static Future<String?> read() async {try{return await _storage.read(key:_key);}catch(_){return null;}}
  static Future<void> remember(String rideId) async {try{await _storage.write(key:_key,value:rideId);}catch(_){/* Server recovery still works without local storage. */}}
  static Future<void> clear() async {try{await _storage.delete(key:_key);}catch(_){}}
}
