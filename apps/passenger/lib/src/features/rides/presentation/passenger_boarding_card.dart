import 'dart:async';
import 'package:flutter/material.dart';
import '../data/passenger_ride_resume_service.dart';

class PassengerBoardingCard extends StatefulWidget {
 const PassengerBoardingCard({super.key,required this.api,required this.rideId,required this.delivery});
 final PassengerBoardingApi api;final String rideId;final bool delivery;
 @override State<PassengerBoardingCard> createState()=>_PassengerBoardingCardState();
}
class _PassengerBoardingCardState extends State<PassengerBoardingCard>{
 Map<String,dynamic>? _status;Timer? _timer;bool _loading=false;
 @override void initState(){super.initState();_load();_timer=Timer.periodic(const Duration(seconds:10),(_)=>_load());}
 @override void dispose(){_timer?.cancel();super.dispose();}
 Future<void> _load() async {if(_loading)return;_loading=true;try{final data=await widget.api.boardingStatus(widget.rideId);if(mounted)setState(()=>_status=data);}catch(_){/* Keep the same verified code during a connection failure. */}finally{_loading=false;}}
 @override Widget build(BuildContext context){
  if(_status?['required']!=true)return const SizedBox.shrink();
  return Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
   Text(widget.delivery?'Código de coleta':'Código de embarque',style:Theme.of(context).textTheme.titleSmall),
   SelectableText(_status?['code'] as String? ?? '',style:Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight:FontWeight.w900,letterSpacing:8)),
   Text(_status?['blocked']==true?'As cinco tentativas foram usadas. Procure o suporte.':widget.delivery?'Informe somente ao entregar o pacote ao motorista.':'Informe somente quando encontrar e conferir o motorista e o veículo.'),
  ]));
 }
}
