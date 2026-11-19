package br.com.ramonessa.driver

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.PowerManager
import io.flutter.plugin.common.EventChannel

/**
 * Reports screen-off and unlock events while a Flutter engine is subscribed.
 * It does not change availability or persist an account state.
 */
class ScreenLockEvents(private val context: Context) : EventChannel.StreamHandler {
    private var receiver: BroadcastReceiver? = null

    override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
        onCancel(null)
        val listener = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    Intent.ACTION_SCREEN_OFF -> events.success("locked")
                    Intent.ACTION_USER_PRESENT -> events.success("unlocked")
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(listener, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            context.registerReceiver(listener, filter)
        }
        receiver = listener
        val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val keyguard = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        events.success(if (!power.isInteractive || keyguard.isKeyguardLocked) "locked" else "unlocked")
    }

    override fun onCancel(arguments: Any?) {
        receiver?.let {
            try {
                context.unregisterReceiver(it)
            } catch (_: IllegalArgumentException) {
                // Receiver is already detached.
            }
        }
        receiver = null
    }
}
