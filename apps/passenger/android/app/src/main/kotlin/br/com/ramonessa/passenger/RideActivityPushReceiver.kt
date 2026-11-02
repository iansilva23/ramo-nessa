package br.com.ramonessa.passenger

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Does not consume or abort the broadcast used by FlutterFire. */
class RideActivityPushReceiver: BroadcastReceiver() {
    override fun onReceive(context:Context,intent:Intent) {
        if(intent.action!="com.google.android.c2dm.intent.RECEIVE") return
        val extras=intent.extras ?: return
        val type=extras.getString("type") ?: return
        val rideId=extras.getString("rideId") ?: return
        try {
            RideActivityNotification(context.applicationContext).fromPush(rideId,type)
        } catch(_:RuntimeException) {
            // Notification rendering must not crash background message delivery.
        }
    }
}
