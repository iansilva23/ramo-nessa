import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/http_passenger_payment_service.dart';
import 'package:ramo_nessa_passenger/src/features/payments/data/passenger_payment_service.dart';
void main() {
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
