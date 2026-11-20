import 'dart:convert';

import 'package:http/http.dart' as http;

import 'driver_verification_photo.dart';

abstract interface class DriverPhotoApiProvider {
  DriverPhotoApi get verificationPhotos;
}

class DriverPhotoApi {
  DriverPhotoApi(this._baseUrl, this._token, this._client);

  final Uri _baseUrl;
  final String _token;
  final http.Client _client;

  Future<DriverPhotoSnapshot?> status() async {
    final result = await _request('GET');
    return result == null ? null : DriverPhotoSnapshot.fromJson(result);
  }

  Future<void> upload(
    DriverPhotoSnapshot snapshot,
    DriverVerificationPhoto field,
    PreparedDriverPhoto image,
  ) async {
    await _request(
      'PUT',
      path: '/${field.field}',
      snapshot: snapshot,
      image: image,
    );
  }

  Future<void> remove(
    DriverPhotoSnapshot snapshot,
    DriverVerificationPhoto field,
  ) async {
    await _request('DELETE', path: '/${field.field}', snapshot: snapshot);
  }

  Future<void> submit(DriverPhotoSnapshot snapshot) async {
    await _request('POST', path: '/submit', snapshot: snapshot);
  }

  Future<Map<String, dynamic>?> _request(
    String method, {
    String path = '',
    DriverPhotoSnapshot? snapshot,
    PreparedDriverPhoto? image,
  }) async {
    if (_token.trim().isEmpty && method == 'GET') return null;
    final uri = _baseUrl
        .resolve('/v1/driver/me/verification-photos$path')
        .replace(
          queryParameters: snapshot == null
              ? null
              : {'vehicle': snapshot.vehicle},
        );
    final request = http.Request(method, uri)
      ..headers['authorization'] = 'Bearer ${_token.trim()}';
    if (image != null) {
      request.headers['content-type'] = PreparedDriverPhoto.contentType;
      request.bodyBytes = image.bytes;
    }
    final response = await _client
        .send(request)
        .then(http.Response.fromStream)
        .timeout(const Duration(seconds: 30));
    if (method == 'GET' && response.statusCode == 404) return null;
    final Object? body;
    try {
      body = jsonDecode(utf8.decode(response.bodyBytes));
    } on FormatException {
      throw const DriverPhotoApiException(
        'Não foi possível consultar suas fotos agora.',
      );
    }
    if (body is Map<String, dynamic> &&
        response.statusCode >= 200 &&
        response.statusCode < 300) {
      return body;
    }
    throw DriverPhotoApiException(
      body is Map && body['message'] is String
          ? body['message'] as String
          : 'Não foi possível concluir. Tente novamente.',
    );
  }
}

class DriverPhotoSnapshot {
  DriverPhotoSnapshot.fromJson(Map<String, dynamic> data)
    : vehicle = '${data['vehicleId']}:${data['vehicleRevision']}',
      photos = {
        for (final photo
            in (data['photos'] as List).cast<Map<String, dynamic>>())
          photo['type'] as String: DriverPhotoItem(
            status: photo['status'] as String,
            reason: photo['reason'] as String?,
          ),
      };

  final String vehicle;
  final Map<String, DriverPhotoItem> photos;
}

class DriverPhotoItem {
  const DriverPhotoItem({required this.status, this.reason});
  final String status;
  final String? reason;
}

class DriverPhotoApiException implements Exception {
  const DriverPhotoApiException(this.message);
  final String message;
}
