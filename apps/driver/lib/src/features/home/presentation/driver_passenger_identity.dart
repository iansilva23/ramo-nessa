import 'dart:async';
import 'package:flutter/material.dart';
import '../data/driver_api.dart';
class DriverPassengerIdentity extends StatefulWidget {
 const DriverPassengerIdentity({super.key,required this.api,required this.rideId,this.showDeadline=true,this.compact=false});
 final DriverRideIdentityApi api;final String rideId;final bool showDeadline,compact;
 @override State<DriverPassengerIdentity> createState()=>_DriverPassengerIdentityState();
}
class _DriverPassengerIdentityState extends State<DriverPassengerIdentity> {
 String _name='Passageiro Ramo Nessa';Duration? _remaining;final _clock=Stopwatch();Timer? _timer;bool _loading=false;
 @override void initState(){super.initState();_load();_timer=Timer.periodic(const Duration(seconds:1),(_){
  if(mounted)setState((){});if(_clock.elapsed.inSeconds>=10&&!_loading)_load();
 });}
 @override void dispose(){_timer?.cancel();super.dispose();}
 Future<void> _load()async{
  if(_loading)return;_loading=true;
  try{final data=await widget.api.rideIdentification(widget.rideId);if(!mounted)return;
   final t=data['terms'] as Map<String,dynamic>?,until=DateTime.tryParse(t?['cancelUntil'] as String? ?? ''),server=DateTime.tryParse(t?['serverTime'] as String? ?? '');
   setState((){_name=data['passengerName'] as String? ?? 'Passageiro Ramo Nessa';_remaining=until==null||server==null?null:until.difference(server);_clock..reset()..start();});
  }catch(_){/* Identity failure must not block ride controls. */}finally{_loading=false;}
 }
 @override Widget build(BuildContext context){
  final seconds=_remaining==null?null:(_remaining!-_clock.elapsed).inSeconds;
  if(widget.compact)return Text(_name,maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(color:Colors.white,fontWeight:FontWeight.w700,fontSize:12));
  return Container(width:double.infinity,padding:const EdgeInsets.all(12),margin:const EdgeInsets.only(bottom:10),
   decoration:BoxDecoration(color:const Color(0xFFF4F4F6),borderRadius:BorderRadius.circular(16)),
   child:Row(children:[const CircleAvatar(backgroundColor:Color(0xFFE8E8EC),foregroundColor:Colors.black,child:Icon(Icons.person_rounded)),
    const SizedBox(width:12),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     const Text('PASSAGEIRO',style:TextStyle(color:Color(0xFF70747D),fontSize:11,fontWeight:FontWeight.w700)),
     Text(_name,style:const TextStyle(color:Colors.black,fontSize:17,fontWeight:FontWeight.w800)),
     if(widget.showDeadline&&seconds!=null)Text(seconds>0?'Cancelamento gratuito por mais ${seconds}s':'Prazo de cancelamento gratuito encerrado',
      style:const TextStyle(color:Color(0xFF70747D),fontSize:12)),
    ]))]));
 }
}
