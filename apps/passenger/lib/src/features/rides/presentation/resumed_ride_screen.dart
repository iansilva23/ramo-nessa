import 'dart:async';
import 'package:flutter/material.dart';
import '../../map/data/route_service.dart';
import '../../payments/data/passenger_payment_service.dart';
import '../../payments/domain/pix_ride_payment_result.dart';
import '../../payments/presentation/ride_payment_screen.dart';
import '../data/passenger_ride_resume_service.dart';
import '../data/passenger_ride_tracking_service.dart';
import '../data/passenger_ride_realtime_service.dart';
import '../domain/prepared_ride.dart';
import 'ride_tracking_screen.dart';

class ResumedRideScreen extends StatelessWidget {
 const ResumedRideScreen({super.key,required this.data,required this.onClose,required this.tracking,required this.payments,this.realtime,this.routes,this.networkTilesEnabled=true});
 final Map<String,dynamic> data;final VoidCallback onClose;final PassengerRideTrackingService tracking;
 final PassengerPaymentService? payments;final PassengerRideRealtimeService? realtime;final RouteService? routes;final bool networkTilesEnabled;
 @override Widget build(BuildContext context){
  final ride=data['ride'] as Map<String,dynamic>,payment=data['payment'] as Map<String,dynamic>?;
  // Recreate the restored route when a foreground check finds a different stage.
  return Navigator(key:ValueKey(Object.hash(ride['id'],ride['state'],payment?['id'],payment?['status'],data['pix']!=null)),
   onGenerateRoute:(_)=>MaterialPageRoute<void>(builder:_buildRide));
 }
 Widget _buildRide(BuildContext context){
  final ride=data['ride'] as Map<String,dynamic>,payment=data['payment'] as Map<String,dynamic>?;
  final awaiting=const {'CREATED','AWAITING_PAYMENT','PAYMENT_FAILED'}.contains(ride['state']);
  if(awaiting){
   final pix=data['pix'];
   if(pix is Map<String,dynamic> && payment?['status']=='pending'){
    final deadline=ride['paymentExpiresAt']??ride['driverHoldExpiresAt'];
    if(deadline is String){return PixRidePaymentScreen(rideId:ride['id'] as String,holdExpiresAt:DateTime.parse(deadline),
     amountLabel:PreparedRide.formatCents(((payment?['amountCents']??(ride['quote'] as Map<String,dynamic>)['totalAmountCents']) as num).toInt()),driverReserved:ride['driverConsentRequired']==true,
     result:PixRidePaymentResult.fromJson(pix),trackingService:tracking,realtimeService:realtime,routeService:routes,networkTilesEnabled:networkTilesEnabled,onRecoveryClose:onClose);}
   }
   if(payment!=null && const {'pending','created','authorized','paid'}.contains(payment['status'])){
    return _PendingPaymentRecovery(data:data,service:tracking as PassengerRideResumeService,onClose:onClose,
     buildNext:(next)=>ResumedRideScreen(data:next,onClose:onClose,tracking:tracking,payments:payments,realtime:realtime,routes:routes,networkTilesEnabled:networkTilesEnabled));
   }
   final deadline=ride['paymentExpiresAt']??ride['driverHoldExpiresAt'];
   if(deadline is String)return RidePaymentScreen(ride:PreparedRide.fromJson({'ride':ride}),paymentService:payments,rideTrackingService:tracking,rideRealtimeService:realtime,routeService:routes,networkTilesEnabled:networkTilesEnabled,onRecoveryClose:onClose);
  }
  return RideTrackingScreen(rideId:ride['id'] as String,remainingWalletCents:null,trackingService:tracking,paymentMethod:ride['paymentMethod'] as String?,realtimeService:realtime,routeService:routes,networkTilesEnabled:networkTilesEnabled,onRecoveryClose:onClose);
 }
}
class _PendingPaymentRecovery extends StatefulWidget {
 const _PendingPaymentRecovery({required this.data,required this.service,required this.onClose,required this.buildNext});
 final Map<String,dynamic> data;final PassengerRideResumeService service;final VoidCallback onClose;final Widget Function(Map<String,dynamic>) buildNext;
 @override State<_PendingPaymentRecovery> createState()=>_PendingPaymentRecoveryState();
}
class _PendingPaymentRecoveryState extends State<_PendingPaymentRecovery>{
 Timer? _timer;Map<String,dynamic>? _next;bool _loading=false;
 @override void initState(){super.initState();_timer=Timer.periodic(const Duration(seconds:5),(_)=>_check());unawaited(_check());}
 @override void dispose(){_timer?.cancel();super.dispose();}
 Future<void> _check() async {if(_loading)return;_loading=true;try{final ride=widget.data['ride'] as Map<String,dynamic>;
  final next=await widget.service.resumeRide(lastRideId:ride['id'] as String);if(!mounted)return;
  if(next['ride']==null){widget.onClose();return;}
  final state=(next['ride'] as Map<String,dynamic>)['state'];final payment=next['payment'] as Map<String,dynamic>?;
  if(state!=ride['state']||next['pix']!=null||!const {'pending','created','authorized','paid'}.contains(payment?['status'])){_timer?.cancel();setState(()=>_next=next);}
 }catch(_){/* Keep the pending payment; never create another charge on failure. */}finally{_loading=false;}}
 @override Widget build(BuildContext context)=>_next!=null?widget.buildNext(_next!):Scaffold(appBar:AppBar(title:const Text('Recuperando pagamento'),automaticallyImplyLeading:false),body:const Center(child:Padding(padding:EdgeInsets.all(24),child:Text('Estamos consultando o pagamento da sua corrida. Não faça outro pagamento. Se precisar, procure o suporte.'))));
}
