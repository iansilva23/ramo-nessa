import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

class PassengerNearbyVehicle {
  const PassengerNearbyVehicle({required this.id, required this.category, required this.position, this.expiresAfterSeconds = 15});
  final String id;
  final String category;
  final LatLng position;
  final int expiresAfterSeconds;
}

class PassengerNearbySnapshot {
  const PassengerNearbySnapshot({required this.vehicles, this.refreshAfterSeconds = 8});
  final List<PassengerNearbyVehicle> vehicles;
  final int refreshAfterSeconds;
}

abstract class PassengerNearbyService {
  Future<PassengerNearbySnapshot> fetch(LatLng center);
  void close() {}
}

class NearbyAuthorizationException implements Exception {}

class HttpPassengerNearbyService extends PassengerNearbyService {
  HttpPassengerNearbyService({required this.baseUrl, required this.accessToken, http.Client? client}) : _client = client ?? http.Client();
  final Uri baseUrl;
  final String accessToken;
  final http.Client _client;
  @override
  Future<PassengerNearbySnapshot> fetch(LatLng center) async {
    final uri = baseUrl.resolve('/v1/passenger/me/nearby-vehicles').replace(queryParameters: {
      'latitude': center.latitude.toStringAsFixed(6),
      'longitude': center.longitude.toStringAsFixed(6),
    });
    final response = await _client.get(uri, headers: {'authorization': 'Bearer $accessToken'}).timeout(const Duration(seconds: 5));
    if (response.statusCode == 401 || response.statusCode == 403) throw NearbyAuthorizationException();
    if (response.statusCode != 200) throw const FormatException('Nearby unavailable');
    final data = jsonDecode(response.body);
    if (data is! Map || data['vehicles'] is! List) throw const FormatException('Invalid nearby snapshot');
    final raw = data['vehicles'] as List;
    if (raw.length > 20) throw const FormatException('Too many nearby vehicles');
    final ids = <String>{};
    final vehicles = <PassengerNearbyVehicle>[];
    for (final item in raw) {
      if (item is! Map || item['id'] is! String || item['category'] is! String || item['latitude'] is! num || item['longitude'] is! num || item['expiresAfterSeconds'] is! int) throw const FormatException('Invalid nearby vehicle');
      final id = item['id'] as String, category = item['category'] as String;
      final lat = (item['latitude'] as num).toDouble(), lng = (item['longitude'] as num).toDouble();
      final ttl = item['expiresAfterSeconds'] as int;
      if (!RegExp(r'^[a-f0-9]{24}$').hasMatch(id) || !ids.add(id) || !{'moto','car','buggy','delivery','comfort_black'}.contains(category) || !lat.isFinite || !lng.isFinite || lat.abs() > 90 || lng.abs() > 180 || (lat == 0 && lng == 0) || ttl < 1 || ttl > 15) throw const FormatException('Invalid nearby vehicle');
      vehicles.add(PassengerNearbyVehicle(id: id, category: category, position: LatLng(lat,lng), expiresAfterSeconds: ttl));
    }
    final refresh = data['refreshAfterSeconds'];
    return PassengerNearbySnapshot(vehicles: List.unmodifiable(vehicles), refreshAfterSeconds: refresh is int ? refresh.clamp(5,30).toInt() : 8);
  }
  @override
  void close() => _client.close();
}

/// Only visible, foreground maps poll; stale and out-of-order results are discarded.
class PassengerNearbyController extends ChangeNotifier {
  PassengerNearbyController(this.service, {this.canPoll, DateTime Function()? now}) : _now = now ?? DateTime.now;
  final PassengerNearbyService service;
  final bool Function()? canPoll;
  final DateTime Function() _now;
  List<PassengerNearbyVehicle> _vehicles = const [];
  List<PassengerNearbyVehicle> get vehicles => _vehicles;
  final Map<String,DateTime> _expires = {};
  LatLng? _center;
  bool _active = false, _fetching = false, _disposed = false;
  int _generation = 0;
  Timer? _timer, _expiryTimer;

  void setCenter(LatLng value) {
    if (_disposed || (_center?.latitude == value.latitude && _center?.longitude == value.longitude)) return;
    _center = value;
    _invalidate();
    if (_active) unawaited(_poll());
  }
  void setActive(bool active) {
    if (_disposed || active == _active) return;
    _active = active;
    _invalidate();
    if (active) unawaited(_poll());
  }
  void _clear() {
    _expiryTimer?.cancel();
    _expires.clear();
    if (_vehicles.isNotEmpty) { _vehicles = const []; notifyListeners(); }
  }
  void _invalidate() { _generation++; _timer?.cancel(); _clear(); }
  void _expire() {
    if (_disposed) return;
    final now = _now();
    _vehicles = _vehicles.where((v) => _expires[v.id]?.isAfter(now) == true).toList(growable:false);
    notifyListeners();
    _expiryTimer?.cancel();
    if (_vehicles.isNotEmpty) {
      final next = _vehicles.map((v) => _expires[v.id]!).reduce((a,b) => a.isBefore(b) ? a : b);
      final delay = next.difference(now);
      _expiryTimer = Timer(delay.isNegative ? Duration.zero : delay, _expire);
    }
  }
  Future<void> _poll() async {
    if (_disposed || !_active || _center == null || _fetching) return;
    if (canPoll?.call() == false) { _clear(); _timer = Timer(const Duration(seconds: 8), _poll); return; }
    _fetching = true;
    final generation = _generation, watch = Stopwatch()..start();
    var seconds = 8;
    try {
      final snapshot = await service.fetch(_center!);
      if (_disposed || !_active || generation != _generation || canPoll?.call() == false) return;
      seconds = snapshot.refreshAfterSeconds.clamp(5,30).toInt();
      _expires.clear();
      final now = _now();
      for (final v in snapshot.vehicles) { _expires[v.id] = now.add(Duration(seconds:v.expiresAfterSeconds)).subtract(watch.elapsed); }
      _vehicles = snapshot.vehicles;
      _expire();
    } on NearbyAuthorizationException {
      if (!_disposed && generation == _generation) { _active = false; _clear(); }
    } catch (_) {
      if (!_disposed && generation == _generation) _clear();
      seconds = 15;
    } finally {
      _fetching = false;
      if (!_disposed && _active) { _timer?.cancel(); _timer = Timer(generation != _generation ? Duration.zero : Duration(seconds:seconds), _poll); }
    }
  }
  @override
  void dispose() { _disposed = true; _generation++; _timer?.cancel(); _expiryTimer?.cancel(); service.close(); super.dispose(); }
}
