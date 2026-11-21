package br.com.ramonessa.driver

import android.app.NotificationChannel
import android.app.NotificationManager
import android.net.Uri
import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.media.AudioAttributes
import android.os.Handler
import android.os.Looper
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.EventChannel

class MainActivity : FlutterActivity() {
    private var offerTone: ToneGenerator? = null
    private val toneHandler = Handler(Looper.getMainLooper())

    private fun createOfferChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel("ramo_ride_offers_v2", "Novas corridas",
            NotificationManager.IMPORTANCE_HIGH)
        val sound = Uri.parse("android.resource://$packageName/raw/nova_corrida")
        channel.setSound(sound, AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION).build())
        channel.enableVibration(true)
        channel.vibrationPattern = longArrayOf(0, 280, 130, 280)
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    @Suppress("DEPRECATION")
    private val vibrator: Vibrator
        get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

    @Suppress("DEPRECATION")
    private fun vibrateOffer() {
        val audio = getSystemService(AudioManager::class.java)
        if (audio.ringerMode == AudioManager.RINGER_MODE_SILENT || !vibrator.hasVibrator()) return
        val timings = longArrayOf(0, 280, 130, 280)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            vibrator.vibrate(
                VibrationEffect.createWaveform(timings, -1),
                VibrationAttributes.createForUsage(VibrationAttributes.USAGE_NOTIFICATION),
            )
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(timings, -1),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build())
        } else {
            vibrator.vibrate(timings, -1)
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        createOfferChannel()
        val activityNotification=RideActivityNotification(applicationContext)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "br.com.ramonessa.driver/ride-activity")
            .setMethodCallHandler { call, result ->
                when(call.method) {
                    "clear" -> {activityNotification.clear(); result.success(true)}
                    "show" -> result.success(activityNotification.show(
                        call.argument<String>("title") ?: "Ramo Nessa",
                        call.argument<String>("detail") ?: "",
                        call.argument<Int>("stage") ?: 0,
                        call.argument<String>("destination") ?: "",
                        call.argument<String>("eta") ?: "",
                        call.argument<Number>("progress")?.toDouble(),
                        call.argument<String>("category") ?: "car"))
                    else -> result.notImplemented()
                }
            }
        EventChannel(flutterEngine.dartExecutor.binaryMessenger, "br.com.ramonessa.driver/screen-lock")
            .setStreamHandler(ScreenLockEvents(applicationContext))
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "br.com.ramonessa.driver/ride-alerts")
            .setMethodCallHandler { call, result ->
                if (call.method == "canPlayOffer") {
                    val audio = getSystemService(AudioManager::class.java)
                    val notifications = getSystemService(NotificationManager::class.java)
                    result.success(audio.ringerMode == AudioManager.RINGER_MODE_NORMAL &&
                        audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION) > 0 &&
                        notifications.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALL)
                    return@setMethodCallHandler
                }
                if (call.method == "vibrateOffer" || call.method == "stopOfferVibration") {
                    if (call.method == "vibrateOffer") vibrateOffer() else vibrator.cancel()
                    result.success(null)
                    return@setMethodCallHandler
                }
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

