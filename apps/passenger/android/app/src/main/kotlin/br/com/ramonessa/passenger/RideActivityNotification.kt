package br.com.ramonessa.passenger

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

/** Shows only a confirmed in-progress ride; terminal state wins over delayed push. */
class RideActivityNotification(private val context: Context) {
    private val prefs=context.getSharedPreferences("ride_activity",Context.MODE_PRIVATE)
    private val manager=context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    fun update(rideId:String,state:String,detail:String, destination:String="", eta:String="",
               identity:String="", progress:Double?=null, category:String="car") {
        if(!rideId.matches(Regex("[0-9a-fA-F-]{36}"))) return
        if(state in TERMINAL) {finish(rideId);return}
        if(prefs.getString("cachedRide",null)!=rideId) {
            prefs.edit().remove("destination").remove("eta").remove("identity").remove("progress").remove("category").apply()
        }
        prefs.edit().putBoolean("enabled",true).putString("cachedRide",rideId).putString("detail",detail.take(350)).apply()
        if(state=="IN_PROGRESS") {
            prefs.edit().putString("destination",destination.take(100)).putString("eta",eta.take(100))
                .putString("identity",identity.take(120)).putString("category",category)
                .putFloat("progress",progress?.takeIf {it.isFinite()}?.toFloat() ?: -1f).apply()
            show(rideId,detail)
        }
        // A delayed pre-start snapshot must not undo a confirmed start.
    }
    fun fromPush(rideId:String,type:String) {
        if(!prefs.getBoolean("enabled",false)) return;
        if(!rideId.matches(Regex("[0-9a-fA-F-]{36}"))) return
        if(type in END_TYPES) {finish(rideId);return}
        if(type=="passenger.ride.started" && prefs.getString("cachedRide",null)==rideId) {
            val detail=if(prefs.getString("cachedRide",null)==rideId) prefs.getString("detail","") ?: "" else ""
            show(rideId,detail)
        }
    }
    private fun show(rideId:String,detail:String) {
        if(prefs.getStringSet("ended",emptySet())!!.contains(rideId)) return
        prefs.edit().putString("activeRide",rideId).apply()
        if(Build.VERSION.SDK_INT>=33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) return
        if(Build.VERSION.SDK_INT>=26) manager.createNotificationChannel(NotificationChannel(CHANNEL,"Corrida em andamento",NotificationManager.IMPORTANCE_LOW))
        val intent=Intent(context,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending=PendingIntent.getActivity(context,ID,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder=if(Build.VERSION.SDK_INT>=26) Notification.Builder(context,CHANNEL) else Notification.Builder(context)
        val text=detail.ifBlank{"Abra o Ramo Nessa para acompanhar sua corrida."}.take(350)
        val destination=prefs.getString("destination","") ?: ""
        val eta=prefs.getString("eta","") ?: ""
        val identity=prefs.getString("identity","") ?: ""
        val category=prefs.getString("category","car") ?: "car"
        val progress=prefs.getFloat("progress",-1f).takeIf {it>=0f && it<=1f}?.toDouble()
        val publicBuilder=if(Build.VERSION.SDK_INT>=26) Notification.Builder(context,CHANNEL) else Notification.Builder(context)
        builder.setPublicVersion(publicBuilder.setSmallIcon(R.drawable.ramo_notification_mark)
            .setContentTitle("Corrida em andamento").setContentText("Desbloqueie para ver os dados da corrida.")
            .setContentIntent(pending).setVisibility(Notification.VISIBILITY_PUBLIC).setShowWhen(false).build())
        manager.notify(ID,builder.setSmallIcon(R.drawable.ramo_notification_mark).setContentTitle("Corrida em andamento")
            .setContentText(text).setStyle(Notification.DecoratedCustomViewStyle())
            .setCustomContentView(RideNotificationCard.views(context,"Corrida em andamento",text,true,destination,expanded=false))
            .setCustomBigContentView(RideNotificationCard.views(context,"Corrida em andamento",text,true,destination,eta,identity,progress,category))
            .setColor(android.graphics.Color.rgb(245,180,0))
            .setContentIntent(pending).setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PRIVATE).build())
    }
    private fun finish(rideId:String) {
        val ended=prefs.getStringSet("ended",emptySet())!!.toMutableSet()
        ended.add(rideId)
        prefs.edit().putStringSet("ended",ended.toList().takeLast(32).toSet()).apply()
        if(prefs.getString("activeRide",null)==rideId) clear()
    }
    fun clear() {manager.cancel(ID);prefs.edit().remove("activeRide").apply()}
    fun disable() {manager.cancel(ID);prefs.edit().clear().apply()}
    companion object {
        private const val ID=31042
        private const val CHANNEL="ramo_passenger_ride_activity"
        private val TERMINAL=setOf("COMPLETED","CANCELLED_BY_PASSENGER","CANCELLED_BY_DRIVER","CANCELLED_BY_ADMIN","REFUNDED","REFUND_PENDING")
        private val END_TYPES=setOf("passenger.ride.completed","passenger.ride.cancelled_by_driver","passenger.ride.cancelled_by_passenger","passenger.ride.cancelled_by_admin")
    }
}

