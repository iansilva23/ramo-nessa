import 'package:flutter_test/flutter_test.dart';
import 'package:ramo_nessa_passenger/src/features/pricing/data/shared_transfer_option.dart';
void main() {
 final settings={'enabled':true,'whatsappPhone':'5588999999999','buttonLabel':'Compartilhado · Valor mais acessível','messageTemplate':'De {origem} para {destino}.','routes':[{'originId':'jericoacoara','destinationId':'airport-jjd','enabled':true}]};
 SharedTransferOption? option(String a,String b,{dynamic config})=>SharedTransferOption.forRoute(settings:config??settings,originId:a,destinationId:b,originLabel:'Jeri',destinationLabel:'Aeroporto JJD');
 test('exact route direction, WhatsApp host and encoded message without price',(){
  final value=option('jericoacoara','airport-jjd')!;
  expect(value.label,'Compartilhado · Valor mais acessível');expect(value.url.host,'wa.me');expect(value.url.path,'/5588999999999');expect(value.url.queryParameters['text'],'De Jeri para Aeroporto JJD.');
  expect(option('airport-jjd','jericoacoara'),isNull);expect(option('prea','airport-jjd'),isNull);
 });
 test('inactive and invalid contacts stay hidden',(){
  expect(option('jericoacoara','airport-jjd',config:{...settings,'enabled':false}),isNull);
  expect(option('jericoacoara','airport-jjd',config:{...settings,'whatsappPhone':'https://bad.example'}),isNull);
  expect(option('jericoacoara','airport-jjd',config:{...settings,'routes':[]}),isNull);
 });
}
