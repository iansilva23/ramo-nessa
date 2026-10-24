import 'dart:async';
import 'package:flutter/material.dart';
import '../data/passenger_ride_resume_service.dart';

/// Never interprets an unreachable server as "no active ride".
class RideRecoveryGate extends StatefulWidget {
 const RideRecoveryGate({super.key,required this.service,required this.child,required this.rideBuilder});
 final PassengerRideResumeService service;final Widget child;
 final Widget Function(Map<String,dynamic> data,VoidCallback close) rideBuilder;
 @override State<RideRecoveryGate> createState()=>_RideRecoveryGateState();
}
class _RideRecoveryGateState extends State<RideRecoveryGate> with WidgetsBindingObserver {
 bool _checked=false,_loading=false;String? _error;Map<String,dynamic>? _data;Timer? _retry;
 @override void initState(){super.initState();WidgetsBinding.instance.addObserver(this);unawaited(_check());}
 @override void dispose(){WidgetsBinding.instance.removeObserver(this);_retry?.cancel();super.dispose();}
 @override void didChangeAppLifecycleState(AppLifecycleState state){if(state==AppLifecycleState.resumed && ModalRoute.of(context)?.isCurrent!=false)unawaited(_check());}
 Future<void> _close() async {
  await RideRecoveryMemory.clear();if(!mounted)return;
  setState((){_data=null;_checked=false;});await _check(useHint:false);
 }
 Future<void> _check({bool useHint=true}) async {
  if(_loading)return;_loading=true;_retry?.cancel();
  try{
   final hint=useHint?await RideRecoveryMemory.read():null;
   final data=await widget.service.resumeRide(lastRideId:hint);
   if(!mounted)return;
   setState((){_data=data['ride']==null?null:data;_checked=true;_error=null;});
  }catch(_){
   if(!mounted)return;
   setState(()=>_error='Reconectando à sua corrida. Suas informações continuam salvas.');
   _retry=Timer(const Duration(seconds:5),()=>unawaited(_check(useHint:useHint)));
  }finally{_loading=false;}
 }
 @override Widget build(BuildContext context){
  if(_data!=null)return widget.rideBuilder(_data!,()=>unawaited(_close()));
  if(_checked && _error==null)return widget.child;
  return Scaffold(body:SafeArea(child:Center(child:Padding(padding:const EdgeInsets.all(24),child:Column(mainAxisSize:MainAxisSize.min,children:[
   const CircularProgressIndicator(),const SizedBox(height:20),Text(_error??'Recuperando sua corrida…',textAlign:TextAlign.center),
   if(_error!=null)TextButton(onPressed:()=>unawaited(_check()),child:const Text('Tentar novamente')),
  ])))));
 }
}
