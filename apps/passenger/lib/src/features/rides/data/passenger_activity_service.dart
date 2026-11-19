import '../domain/passenger_activity.dart';

abstract interface class PassengerActivityService {
  Future<PassengerActivitySnapshot> fetch();
}
