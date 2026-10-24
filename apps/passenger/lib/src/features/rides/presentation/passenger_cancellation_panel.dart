import 'dart:async';
import 'package:flutter/material.dart';
import '../data/passenger_ride_tracking_service.dart';

class PassengerCancellationPanel extends StatefulWidget {
 const PassengerCancellationPanel({super.key,required this.rideId,required this.api,required this.onChanged,this.now});
 final DateTime Function()? now;
 final String rideId;final PassengerManualCancellationApi api;final VoidCallback onChanged;
 @override State<PassengerCancellationPanel> createState()=>_PassengerCancellationPanelState();
}
class _PassengerCancellationPanelState extends State<PassengerCancellationPanel> {
 Timer? _timer;Map<String,dynamic>? _data;String? _error;bool _busy=false,_loading=false;
 final _key=TextEditingController(),_holder=TextEditingController();String _type='cpf';
 DateTime? _receivedAt;Duration? _remaining;int _ticks=0;
 DateTime get _now=>widget.now?.call()??DateTime.now();
 @override void initState(){super.initState();_load();_timer=Timer.periodic(const Duration(seconds:1),(_){
  if(!mounted)return;setState((){});if(++_ticks>=10&&!_loading)_load();
 });}
 @override void dispose(){_timer?.cancel();_key.dispose();_holder.dispose();super.dispose();}
 Future<void> _load() async {
  if(_loading)return;_loading=true;
  try{
   final data=await widget.api.cancellationRequest(widget.rideId);
   if(!mounted)return;
   final terms=data['terms'] as Map<String,dynamic>?;
   final until=DateTime.tryParse(terms?['cancelUntil'] as String? ?? '');
   final server=DateTime.tryParse(terms?['serverTime'] as String? ?? '');
   setState((){_data=data;_remaining=until==null||server==null?null:until.difference(server);_receivedAt=_now;_ticks=0;});
  }catch(_){if(mounted&&_data==null)setState(()=>_error='Não foi possível conferir o prazo de cancelamento. Tente atualizar.');}
  finally{_loading=false;}
 }
 int? get _seconds=>_remaining==null||_receivedAt==null?null:((_remaining!-_now.difference(_receivedAt!)).inMicroseconds/1000000).ceil();
 Future<void> _cancel() async {
  if(_busy)return;
  final confirm=await showDialog<bool>(context:context,builder:(c)=>AlertDialog(
   title:const Text('Cancelar corrida?'),
   content:const Text('Dentro do prazo gratuito não há taxa. Se já houve pagamento, a equipe fará a devolução manual. Você poderá informar seu Pix depois.'),
   actions:[TextButton(onPressed:()=>Navigator.pop(c,false),child:const Text('Continuar esperando')),
    FilledButton(onPressed:()=>Navigator.pop(c,true),child:const Text('Confirmar cancelamento'))]));
  if(confirm!=true||!mounted)return;
  setState((){_busy=true;_error=null;});
  try{await widget.api.cancellationRequest(widget.rideId,method:'POST',body:{'reason':'Desistência do passageiro'});widget.onChanged();await _load();}
  on PassengerRideTrackingException catch(e){if(mounted)setState(()=>_error=e.message);await _load();}
  catch(_){if(mounted)setState(()=>_error='Não foi possível cancelar. Atualize e tente novamente.');}
  finally{if(mounted)setState(()=>_busy=false);}
 }
 Future<void> _savePix() async {
  setState((){_busy=true;_error=null;});
  try{await widget.api.cancellationRequest(widget.rideId,method:'PUT',pix:true,body:{'type':_type,'key':_key.text.trim(),'holder':_holder.text.trim()});await _load();}
  on PassengerRideTrackingException catch(e){if(mounted)setState(()=>_error=e.message);}
  catch(_){if(mounted)setState(()=>_error='Não foi possível salvar o Pix.');}
  finally{if(mounted)setState(()=>_busy=false);}
 }
 String _money(num cents)=>'R\$ ${(cents/100).toStringAsFixed(2).replaceAll('.',',')}';
 @override Widget build(BuildContext context){
  final cancellation=_data?['cancellation'] as Map<String,dynamic>?;
  final visible=_data?['canCancel']==true&&(_seconds==null||_seconds!>0);
  final status=cancellation?['status'] as String?;
  return Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,children:[
   // Shrink the bottom-anchored panel so the information above moves down.
   AnimatedSize(duration:const Duration(milliseconds:280),curve:Curves.easeInOutCubic,alignment:Alignment.bottomCenter,
    child:visible?Padding(padding:const EdgeInsets.only(top:12),child:OutlinedButton.icon(
     key:const ValueKey('passenger-free-cancel'),onPressed:_busy?null:_cancel,
     icon:const Icon(Icons.cancel_outlined),label:Text(_seconds==null?'Cancelar corrida':'Cancelar gratuitamente · ${_seconds}s'))):const SizedBox(width:double.infinity)),
   if(cancellation!=null)...[
    const SizedBox(height:12),
    Text(status=='refunded'?'Devolução realizada':'Corrida cancelada',style:const TextStyle(fontWeight:FontWeight.w800)),
    Text(status=='refunded'?'A equipe registrou a devolução de ${_money((cancellation['refundCents'] as num?)??0)}.':
     'Sua devolução será analisada e realizada manualmente pela equipe Ramo Nessa.'),
    Text('Taxa: ${_money((cancellation['feeCents'] as num?)??0)} · A devolver: ${_money((cancellation['refundCents'] as num?)??0)}'),
    if(status=='awaiting_pix'||status=='review')...[
     const SizedBox(height:12),
     if(cancellation['pix']!=null)const Text('Dados Pix enviados. Você pode corrigir antes da aprovação.'),
     DropdownButtonFormField<String>(initialValue:_type,decoration:const InputDecoration(labelText:'Tipo de chave Pix'),
      items:const [DropdownMenuItem(value:'cpf',child:Text('CPF')),DropdownMenuItem(value:'email',child:Text('E-mail')),
       DropdownMenuItem(value:'phone',child:Text('Telefone')),DropdownMenuItem(value:'random',child:Text('Aleatória'))],
      onChanged:_busy?null:(v)=>setState(()=>_type=v??'cpf')),
     TextField(controller:_key,maxLength:254,decoration:const InputDecoration(labelText:'Chave Pix',helperText:'Telefone com +55 e DDD. CPF sem pontuação.')),
     TextField(controller:_holder,maxLength:120,decoration:const InputDecoration(labelText:'Nome do titular')),
     FilledButton(onPressed:_busy?null:_savePix,child:const Text('Salvar dados para devolução')),
    ],
    if(status=='approved')const Text('Devolução aprovada. Aguardando o Pix manual da equipe.'),
   ],
   if(_error!=null)Padding(padding:const EdgeInsets.only(top:8),child:Text(_error!,style:TextStyle(color:Theme.of(context).colorScheme.error))),
  ]);
 }
}
