package br.com.ramonessa.driver

import android.app.NotificationManager
import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.EventChannel

class MainActivity : FlutterActivity() {
    private var offerTone: ToneGenerator? = null
    private val toneHandler = Handler(Looper.getMainLooper())

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val activityNotification=RideActivityNotification(applicationContext)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "br.com.ramonessa.driver/ride-activity")
            .setMethodCallHandler { call, result ->
                when(call.method) {
                    "clear" -> {activityNotification.clear(); result.success(true)}
                    "show" -> result.success(activityNotification.show(
                        call.argument<String>("title") ?: "Ramo Nessa",
                        call.argument<String>("detail") ?: "",
                        call.argument<Int>("stage") ?: 0))
                    else -> result.notImplemented()
                }
            }
        EventChannel(flutterEngine.dartExecutor.binaryMessenger, "br.com.ramonessa.driver/screen-lock")
            .setStreamHandler(ScreenLockEvents(applicationContext))
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "br.com.ramonessa.driver/ride-alerts")
            .setMethodCallHandler { call, result ->
                if (call.method != "playOfferAlert") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
                val notifications = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                // No sound in silent/vibrate mode, zero notification volume or Do Not Disturb.
                if (audio.ringerMode == AudioManager.RINGER_MODE_NORMAL &&
                    audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION) > 0 &&
                    notifications.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALL) {
                    toneHandler.removeCallbacksAndMessages(null)
                    offerTone?.release()
                    try {
                        offerTone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 55)
                        offerTone?.startTone(ToneGenerator.TONE_PROP_BEEP, 140)
                        toneHandler.postDelayed({ offerTone?.release(); offerTone = null }, 300)
                    } catch (_: RuntimeException) {
                        offerTone?.release()
                        offerTone = null
                    }
                }
                result.success(null)
            }
    }

    override fun onDestroy() {
        toneHandler.removeCallbacksAndMessages(null)
        offerTone?.release()
        offerTone = null
        super.onDestroy()
    }
}
