import 'dart:convert';

import 'package:ramo_design_system/ramo_design_system.dart';

import 'package:http/http.dart' as http;

import '../../../core/config/ramo_core_config.dart';
import '../../../core/network/json_response.dart';
import '../domain/passenger_ride_tracking_snapshot.dart';
import 'passenger_ride_tracking_service.dart';
import 'passenger_ride_resume_service.dart';

class HttpPassengerRideTrackingService
    implements
        RamoRideChatApi,
        PassengerManualCancellationApi,
        PassengerRideTrackingService,
        PassengerRideResumeService,
        PassengerBoardingApi,
        PassengerRideRecoveryService {
  HttpPassengerRideTrackingService({
    required Uri baseUrl,
    String? accessToken,
    String? passengerId,
    http.Client? client,
  }) : _baseUrl = baseUrl,
       _accessToken = accessToken ?? '',
       _passengerId = passengerId ?? RamoCoreConfig.devPassengerId,
       _client = client ?? http.Client();

  final Uri _baseUrl;
  final String _accessToken;
  final String _passengerId;
  final http.Client _client;

  Future<Map<String,dynamic>> _getRecovery(Uri uri) async {
    final response=await _client.get(uri,headers:_identityHeaders).timeout(RamoCoreConfig.requestTimeout);
    final decoded=decodeJsonObject(response.body);
    if(response.statusCode==200&&decoded!=null)return decoded;
    throw PassengerRideTrackingException(apiErrorMessage(decoded,'Reconectando à sua corrida. Tente novamente.'));
  }
  @override
  Future<Map<String,dynamic>> resumeRide({String? lastRideId}) async {
    final data=await _getRecovery(_baseUrl.resolve('/v1/passenger/me/ride').replace(queryParameters:lastRideId==null?null:{'lastRideId':lastRideId}));
    final ride=data['ride'];
    // Only an explicit null from the server means there is no ride to recover.
    if(!data.containsKey('ride') || (ride!=null &&
        (ride is! Map<String,dynamic> || ride['id'] is! String || ride['state'] is! String))){
      throw const PassengerRideTrackingException('Não conseguimos recuperar sua corrida. Tente novamente.');
    }
    return data;
  }
  @override
  Future<Map<String,dynamic>> boardingStatus(String rideId)=>_getRecovery(_baseUrl.resolve('/v1/rides/$rideId/boarding'));

  @override
  Future<Map<String,dynamic>> cancellationRequest(String rideId,{String method='GET',Map<String,dynamic>? body,bool pix=false}) async {
    final url=_baseUrl.resolve('/v1/rides/$rideId/${pix?'refund-pix':'cancellation'}');
    final request=http.Request(method,url)..headers.addAll(_identityHeaders);
    if(body!=null)request.body=jsonEncode(body);
    final response=await http.Response.fromStream(await _client.send(request).timeout(RamoCoreConfig.requestTimeout));
    final decoded=decodeJsonObject(response.body);
    if(response.statusCode==200&&decoded!=null)return decoded;
    throw PassengerRideTrackingException(apiErrorMessage(decoded,'Não foi possível atualizar o cancelamento.'));
  }

  Map<String, String> get _identityHeaders => {
    'content-type': 'application/json',
    if (_accessToken.trim().isNotEmpty)
      'authorization': 'Bearer ${_accessToken.trim()}'
    else if (_passengerId.trim().isNotEmpty)
      'x-dev-passenger-id': _passengerId.trim(),
  };

  @override
  Future<PassengerRideTrackingSnapshot> tracking(String rideId) async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/rides/$rideId/tracking'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 200 && decoded != null) {
      try {
        return PassengerRideTrackingSnapshot.fromJson(decoded);
      } catch (_) {
        throw const PassengerRideTrackingException(
          'O servidor retornou um rastreamento inválido.',
        );
      }
    }

    throw PassengerRideTrackingException(
      apiErrorMessage(decoded, 'Não conseguimos atualizar sua corrida agora.'),
    );
  }

  @override
  Future<PassengerRideRecoveryResult> retryDriverSearch(String rideId) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/rides/$rideId/retry-search'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);
    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 200 && decoded != null) {
      return PassengerRideRecoveryResult(
        dispatchStatus: decoded['dispatchStatus'] as String?,
      );
    }
    throw PassengerRideTrackingException(
      apiErrorMessage(
        decoded,
        'Não conseguimos procurar outro motorista agora.',
      ),
    );
  }

  @override
  Future<PassengerRideRecoveryResult> cancelSearch(String rideId) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/rides/$rideId/cancel-search'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);
    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 200 && decoded != null) {
      return PassengerRideRecoveryResult(
        refundStatus: decoded['refundStatus'] as String?,
      );
    }
    throw PassengerRideTrackingException(
      apiErrorMessage(decoded, 'Não conseguimos cancelar a busca agora.'),
    );
  }

  @override
  Future<RamoRideChatStatus> rideChatStatus(String rideId) async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/rides/$rideId/messages/status'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);
    if (response.statusCode != 200) {
      throw Exception('Não foi possível atualizar as mensagens.');
    }
    return RamoRideChatStatus.fromJson(
      jsonDecode(response.body) as Map<String, dynamic>,
    );
  }

  @override
  Future<void> markRideMessagesRead(
    String rideId,
    List<String> messageIds,
  ) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/rides/$rideId/messages/read'),
          headers: _identityHeaders,
          body: jsonEncode({'messageIds': messageIds}),
        )
        .timeout(RamoCoreConfig.requestTimeout);
    if (response.statusCode != 200) {
      throw Exception('Não foi possível registrar a leitura.');
    }
  }

  @override
  Future<List<Map<String, dynamic>>> rideChatPage(
    String rideId, {
    String? before,
  }) async {
    final uri = _baseUrl
        .resolve('/v1/rides/$rideId/messages')
        .replace(queryParameters: before == null ? null : {'before': before});
    final response = await _client
        .get(uri, headers: _identityHeaders)
        .timeout(RamoCoreConfig.requestTimeout);
    if (response.statusCode != 200) {
      throw Exception('Não foi possível carregar as mensagens anteriores.');
    }
    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return (decoded['messages'] as List).cast<Map<String, dynamic>>();
  }

  @override
  Future<List<PassengerRideChatMessage>> rideMessages(String rideId) async {
    final response = await _client
        .get(
          _baseUrl.resolve('/v1/rides/$rideId/messages'),
          headers: _identityHeaders,
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 200 && decoded != null) {
      final raw = decoded['messages'];
      if (raw is! List) return const [];
      return raw
          .whereType<Map<String, dynamic>>()
          .map(PassengerRideChatMessage.fromJson)
          .toList(growable: false);
    }

    throw PassengerRideTrackingException(
      apiErrorMessage(decoded, 'Não conseguimos carregar as mensagens agora.'),
    );
  }

  @override
  Future<PassengerRideChatMessage> sendRideMessage({
    required String rideId,
    required String body,
  }) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/rides/$rideId/messages'),
          headers: _identityHeaders,
          body: jsonEncode({'body': body}),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 201 && decoded != null) {
      final message = decoded['message'];
      if (message is Map<String, dynamic>) {
        return PassengerRideChatMessage.fromJson(message);
      }
    }

    throw PassengerRideTrackingException(
      apiErrorMessage(decoded, 'Não conseguimos enviar sua mensagem agora.'),
    );
  }

  @override
  Future<PassengerDriverRatingResult> rateDriver(
    String rideId,
    int stars,
  ) async {
    final response = await _client
        .post(
          _baseUrl.resolve('/v1/rides/$rideId/rating'),
          headers: _identityHeaders,
          body: jsonEncode({'stars': stars}),
        )
        .timeout(RamoCoreConfig.requestTimeout);

    final decoded = decodeJsonObject(response.body);
    if (response.statusCode == 200 && decoded != null) {
      try {
        return PassengerDriverRatingResult.fromJson(decoded);
      } catch (_) {
        throw const PassengerRideTrackingException(
          'O servidor retornou uma avaliação inválida.',
        );
      }
    }

    throw PassengerRideTrackingException(
      apiErrorMessage(decoded, 'Não conseguimos enviar sua avaliação agora.'),
    );
  }
}
