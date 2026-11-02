package br.com.ramonessa.driver

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

/** Companion status card. The existing location service owns GPS/background work. */
class RideActivityNotification(private val context: Context) {
    private val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    fun clear() { manager.cancel(ID) }

    fun show(title: String, detail: String, stage: Int, destination: String = "",
             eta: String = "", progress: Double? = null, category: String = "car"): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(NotificationChannel(CHANNEL, "Acompanhamento da corrida", NotificationManager.IMPORTANCE_LOW))
        }
        val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(context, ID, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL) else Notification.Builder(context)
        builder.setSmallIcon(R.drawable.ramo_notification_mark)
            .setContentTitle(title.take(100))
            .setContentText(detail.take(300))
            .setStyle(Notification.DecoratedCustomViewStyle())
            .setCustomContentView(RideNotificationCard.views(context, title, detail, stage > 0, destination, expanded = false))
            .setCustomBigContentView(RideNotificationCard.views(context, title, detail, stage > 0, destination, eta, progress = progress, category = category))
            .setColor(android.graphics.Color.rgb(245, 180, 0))
            .setContentIntent(pending)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(Notification.CATEGORY_NAVIGATION)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
        val publicTitle = if (stage > 0) "Corrida em andamento" else title
        val publicText = if (stage > 0) "Desbloqueie para ver os dados da corrida." else detail
        val publicBuilder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL) else Notification.Builder(context)
        builder.setPublicVersion(publicBuilder.setSmallIcon(R.drawable.ramo_notification_mark)
            .setContentTitle(publicTitle).setContentText(publicText).setContentIntent(pending)
            .setVisibility(Notification.VISIBILITY_PUBLIC).setShowWhen(false).build())
        manager.notify(ID, builder.build())
        return true
    }
    companion object {
        private const val CHANNEL = "ramo_ride_activity"
        private const val ID = 31041
    }
}

