import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/http_passenger_payment_service.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/passenger_payment_service.dart';
void main() {
  test('account email is authenticated, normalized and reread after edits', () async {
    var email = ' FIRST@example.test ';
    var reads = 0;
    final service = HttpPassengerPaymentService(
      baseUrl: Uri.parse('https://core.example.test'),
      accessToken: 'authenticated-passenger-token',
      client: MockClient((request) async {
        expect(request.method, 'GET');
        expect(request.url.path, '/v1/passenger/me/account');
        expect(request.headers['authorization'], 'Bearer authenticated-passenger-token');
        reads++;
        return http.Response(jsonEncode({'email': email}), 200);
      }),
    );
    expect(await service.loadAccountPaymentEmail(), 'first@example.test');
    email = 'changed@example.test';
    expect(await service.loadAccountPaymentEmail(), 'changed@example.test');
    expect(service.checkoutEmail, 'changed@example.test');
    expect(reads, 2);
  });
  test('account lookup failure never reuses a previous payer silently', () async {
    final service = HttpPassengerPaymentService(
      baseUrl: Uri.parse('https://core.example.test'),
      accessToken: 'authenticated-passenger-token',
      client: MockClient((_) async => http.Response(jsonEncode({'error': 'UNAUTHORIZED'}), 401)),
    );
    await expectLater(service.loadAccountPaymentEmail(), throwsA(isA<PassengerPaymentException>()));
  });

  test('missing identity email exposes only the explicit checkout requirement', () async {
    final service = HttpPassengerPaymentService(baseUrl:Uri.parse('https://core.example.test'),accessToken:'authenticated-passenger-token',
      client:MockClient((request) async => http.Response(jsonEncode({'error':'PASSENGER_EMAIL_REQUIRED','message':'Informe seu e-mail.'}),400)));
    await expectLater(service.createPixRidePayment(rideId:'ride-1',idempotencyKey:'same-intent'),
      throwsA(isA<PassengerPaymentException>().having((error) => error.code,'code','PASSENGER_EMAIL_REQUIRED')));
  });
  test('Pix checkout sends email and preserves authenticated idempotent request', () async {
    final service = HttpPassengerPaymentService(baseUrl:Uri.parse('https://core.example.test'),accessToken:'authenticated-passenger-token',
      client:MockClient((request) async {
        expect(jsonDecode(request.body)['payerEmail'],'ian@example.com');
        expect(request.headers['authorization'],'Bearer authenticated-passenger-token');
        expect(request.headers['idempotency-key'],'one-ride-one-payment');
        return http.Response(jsonEncode({'payment':{'id':'payment-1','status':'pending'},'pix':{
          'orderId':'order-1','paymentId':'gateway-payment-1','qrCode':'copy-code','qrCodeBase64':''}}),201);
      }));
    expect(service.checkoutEmail,isNull);
    final result = await service.createPixWithEmail(rideId:'ride-1',idempotencyKey:'one-ride-one-payment',payerEmail:'ian@example.com');
    expect(result.qrCode,'copy-code'); expect(service.checkoutEmail,'ian@example.com');
  });
}
