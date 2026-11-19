import 'dart:async';
import 'package:flutter/material.dart';

abstract interface class RamoRideOccurrenceApi {
  Future<Map<String,dynamic>> occurrenceRequest(String path,{String method='GET',Map<String,dynamic>? body});
}
class RamoRideOccurrencePanel extends StatefulWidget {
  const RamoRideOccurrencePanel({super.key,required this.api,required this.rideId,this.driver=false,this.paymentMethod,this.onChanged});
  final RamoRideOccurrenceApi api;
  final String rideId;
  final bool driver;
  final String? paymentMethod;
  final Future<void> Function()? onChanged;
  @override
  State<RamoRideOccurrencePanel> createState()=>_OccurrenceState();
}
class _OccurrenceState extends State<RamoRideOccurrencePanel> with WidgetsBindingObserver {
  Map<String,dynamic>? data;
  String? error;
  bool busy=false,confirmedPickup=false;
  final statement=TextEditingController();
  Timer? timer;
  String get path=>widget.driver?'/v1/driver/me/rides/${widget.rideId}/occurrences':'/v1/rides/${widget.rideId}/occurrences';
  @override
  void initState(){super.initState();WidgetsBinding.instance.addObserver(this);unawaited(load());timer=Timer.periodic(const Duration(seconds:10),(_)=>unawaited(load()));}
  @override
  void dispose(){timer?.cancel();statement.dispose();WidgetsBinding.instance.removeObserver(this);super.dispose();}
  @override
  void didChangeAppLifecycleState(AppLifecycleState state){if(state==AppLifecycleState.resumed)unawaited(load());}
  Future<void> load()async{if(busy)return;try{final next=await widget.api.occurrenceRequest(path);if(mounted)setState((){data=next;error=null;});if(next['enabled']!=true)timer?.cancel();}catch(_){if(mounted)setState(()=>error='Não conseguimos atualizar a ocorrência. Seus registros continuam preservados.');}}
  Future<void> send(String endpoint,String method,Map<String,dynamic> body)async{
    if(busy)return;
    if(body.containsKey('statement')&&statement.text.trim().length<10){setState(()=>error='Descreva o ocorrido em pelo menos 10 caracteres.');return;}
    setState((){busy=true;error=null;});
    try{await widget.api.occurrenceRequest(endpoint,method:method,body:body);statement.clear();await widget.onChanged?.call();}
    catch(e){if(mounted)setState(()=>error=e.toString());}
    finally{if(mounted)setState(()=>busy=false);}
    await load();
  }
  @override
  Widget build(BuildContext context){
    if(data==null)return error==null?const SizedBox.shrink():Text(error!);
    if(data!['enabled']!=true)return const SizedBox.shrink();
    final items=(data!['items'] as List? ?? []).whereType<Map>().toList();
    final item=items.isEmpty?<String,dynamic>{}:Map<String,dynamic>.from(items.last);
    final active=items.isNotEmpty&&item['status']!='resolved';
    final cash=widget.paymentMethod=='cash'||item['kind']=='cash';
    final pickup=data!['pickup'];
    Widget action(String label,VoidCallback invoke)=>Padding(padding:const EdgeInsets.only(top:8),child:FilledButton(onPressed:busy?null:invoke,child:Text(label)));
    void choose(String choice)=>unawaited(send('$path/${item['id']}','PUT',{'choice':choice,'revision':item['revision'],'statement':statement.text,...(choice=='continue'?{'pickup':pickup}:<String,dynamic>{})}));
    return Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,mainAxisSize:MainAxisSize.min,children:[
      const Text('Resolver ocorrência',style:TextStyle(fontSize:18,fontWeight:FontWeight.w700)),
      const SizedBox(height:8),
      const Text('Mantenha um local seguro de desembarque. Os relatos ficam vinculados à corrida e ao suporte.'),
      if(active)...[
        Text('Situação: ${switch(item['status']){'awaiting_passenger'=>'aguardando passageiro','replacement_search'=>'buscando substituto','refund_pending'=>'devolução em processamento','review'=>'em análise pelo suporte',_=>'atualizando'}}'),
        Text('Relato do motorista: ${item['driver_statement']}'),
        if(item['passenger_statement']!=null)Text('Relato do passageiro: ${item['passenger_statement']}'),
      ],
      if((!active&&widget.driver)||(active&&!widget.driver))...[
        const SizedBox(height:12),
        TextField(controller:statement,maxLength:2000,maxLines:3,decoration:const InputDecoration(labelText:'Conte sua versão',border:OutlineInputBorder())),
      ],
      if(!active&&widget.driver)...[
        if(cash)action('Registrar interrupção em dinheiro',()=>unawaited(send(path,'POST',{'kind':'cash','statement':statement.text})))
        else ...[
          action('Encerrar e solicitar devolução integral',()=>unawaited(send(path,'POST',{'kind':'refund','statement':statement.text}))),
          action('Informar problema mecânico',()=>unawaited(send(path,'POST',{'kind':'mechanical','statement':statement.text}))),
          action('Contestar encerramento',()=>unawaited(send(path,'POST',{'kind':'dispute','statement':statement.text}))),
        ],
      ],
      if(active&&widget.driver&&cash&&item['cash_returned_at']==null)action(item['cash_received_at']==null?'Confirmo que não houve recebimento':'Confirmo que devolvi o dinheiro recebido',()=>unawaited(send('/v1/driver/me/occurrences/${item['id']}/cash-return','POST',{}))),
      if(active&&!widget.driver)...[
        if(item['kind']=='mechanical'&&['awaiting_passenger','replacement_search'].contains(item['status']))...[
          action('Solicitar devolução integral',()=>choose('refund')),
          if(item['status']=='awaiting_passenger')...[
            if(pickup is Map)CheckboxListTile(value:confirmedPickup,onChanged:busy?null:(v)=>setState(()=>confirmedPickup=v??false),title:const Text('Confirmo que estou em local seguro no ponto da interrupção indicado pelo GPS'))
            else const Text('Local de embarque indisponível. Peça ajuda ao suporte para confirmar um ponto seguro.'),
            FilledButton(onPressed:busy||!confirmedPickup||pickup is! Map?null:()=>choose('continue'),child:const Text('Continuar com outro motorista, sem nova cobrança')),
          ],
        ],
        if(cash&&item['cash_returned_at']!=null)...[
          action('Confirmo a devolução integral',()=>choose('cash_confirm')),
          action('Contestar a devolução',()=>choose('cash_contest')),
        ] else if(cash)action('Informar problema com a devolução',()=>choose('cash_contest'))
        else if(item['kind']=='dispute')action('Enviar minha versão ao suporte',()=>choose('dispute')),
      ],
      if(error!=null)Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error)),
      if(busy)const LinearProgressIndicator(),
    ])));
  }
}
