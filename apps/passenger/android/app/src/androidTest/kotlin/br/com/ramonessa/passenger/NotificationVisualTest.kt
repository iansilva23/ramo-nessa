package br.com.ramonessa.passenger

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import android.view.View
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.FileOutputStream

/** Offline fixtures only: does not launch Flutter, authenticate or contact any server. */
@RunWith(AndroidJUnit4::class)
class NotificationVisualTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private val context=instrumentation.targetContext
    private val manager=context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    private val ride="00000000-0000-4000-8000-000000000077"
    private fun shell(command:String) {
        instrumentation.uiAutomation.executeShellCommand(command).use { fd ->
            android.os.ParcelFileDescriptor.AutoCloseInputStream(fd).use { it.readBytes() }
        }
    }
    @Before fun setup() {
        manager.cancelAll()
        context.getSharedPreferences("ride_activity",Context.MODE_PRIVATE).edit().clear().commit()
        if(Build.VERSION.SDK_INT>=33) shell("pm grant ${context.packageName} android.permission.POST_NOTIFICATIONS")
        shell("input keyevent KEYCODE_WAKEUP")
        shell("wm dismiss-keyguard")
        shell("settings put secure lock_screen_show_notifications 1")
        shell("settings put secure lock_screen_allow_private_notifications 1")
    }
    private fun current():Notification {
        Thread.sleep(500)
        assertEquals(1,manager.activeNotifications.size)
        return manager.activeNotifications.single().notification
    }
    private fun render(notification:Notification,name:String,scale:Float=1f,compact:Boolean=false) {
        val config=android.content.res.Configuration(context.resources.configuration)
        config.fontScale=scale
        val themed=context.createConfigurationContext(config)
        instrumentation.runOnMainSync {
            val remote=if(compact) notification.contentView else notification.bigContentView
            assertNotNull("Custom notification view required",remote)
            val view=remote!!.apply(themed,null)
            val density=themed.resources.displayMetrics.density
            val width=(328*density).toInt()
            view.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED))
            view.layout(0,0,width,view.measuredHeight)
            val card=view.findViewById<View>(R.id.ride_card)
            assertNotNull(card)
            assertTrue("Content exceeds Android height budget",card.height<=(if(compact)49 else 252)*density)
            assertFalse(view.findViewById<TextView>(R.id.ride_title).text.isBlank())
            val bitmap=Bitmap.createBitmap(width,view.measuredHeight,Bitmap.Config.ARGB_8888)
            view.draw(Canvas(bitmap))
            val directory=File(context.filesDir,"notification-previews").apply{mkdirs()}
            FileOutputStream(File(directory,name+".png")).use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) }
            bitmap.recycle()
        }
    }
    private fun systemScreenshot(name:String) {
        shell("cmd statusbar expand-notifications")
        Thread.sleep(700)
        // Expand the sole application notification using the native System UI.
        val bitmap=instrumentation.uiAutomation.takeScreenshot()
        assertNotNull(bitmap)
        val directory=File(context.filesDir,"notification-previews").apply{mkdirs()}
        FileOutputStream(File(directory,name+"-system-ui.png")).use { bitmap!!.compress(Bitmap.CompressFormat.PNG,100,it) }
        bitmap?.recycle()
        shell("cmd statusbar collapse")
        shell("locksettings set-disabled false")
        shell("input keyevent KEYCODE_SLEEP")
        Thread.sleep(300)
        shell("input keyevent KEYCODE_WAKEUP")
        Thread.sleep(700)
        val locked=instrumentation.uiAutomation.takeScreenshot()
        assertNotNull(locked)
        FileOutputStream(File(directory,name+"-lock-screen.png")).use { locked!!.compress(Bitmap.CompressFormat.PNG,100,it) }
        locked?.recycle()
        shell("wm dismiss-keyguard")
    }
    @Test fun inProgressUsesCustomCardAndRedactsPrivateData() {
        RideActivityNotification(context).update(ride,"IN_PROGRESS","Preá → Jijoca","Praia do Preá","Chegada estimada: 14:35","Motorista de teste • Veículo de teste",.58,"car")
        val notification=current()
        assertTrue((notification.flags and Notification.FLAG_ONGOING_EVENT)!=0)
        assertNotNull(notification.contentIntent)
        assertNotNull(notification.publicVersion)
        assertFalse(notification.publicVersion.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("Preá"))
        render(notification,"passenger-in-progress-expanded")
        render(notification,"passenger-in-progress-compact",compact=true)
        render(notification,"passenger-in-progress-large-text",scale=1.3f)
        systemScreenshot("passenger-in-progress")
        manager.cancelAll()
    }
    @Test fun preStartRemainsHiddenAndCompletionRemovesCard() {
        val card=RideActivityNotification(context)
        card.update(ride,"DRIVER_ASSIGNED","Preá → Jijoca")
        assertEquals(0,manager.activeNotifications.size)
        card.update(ride,"IN_PROGRESS","Preá → Jijoca","Praia do Preá")
        current()
        card.fromPush(ride,"passenger.ride.completed")
        assertEquals(0,manager.activeNotifications.size)
        card.fromPush(ride,"passenger.ride.started")
        assertEquals(0,manager.activeNotifications.size)
    }
}
