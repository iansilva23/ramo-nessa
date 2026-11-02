package br.com.ramonessa.passenger

import android.app.NotificationManager
import android.content.Context
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class RideActivityNotificationTest {
    private val ride="00000000-0000-4000-8000-000000000001"
    private lateinit var card:RideActivityNotification
    private lateinit var manager:NotificationManager
    @Before fun setup() {
        val app=RuntimeEnvironment.getApplication()
        app.getSharedPreferences("ride_activity",Context.MODE_PRIVATE).edit().clear().commit()
        manager=app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancelAll()
        card=RideActivityNotification(app)
    }
    @Test fun onlyInProgressIsVisible() {
        card.update(ride,"DRIVER_ASSIGNED","Preá → Jijoca")
        assertEquals(0,shadowOf(manager).allNotifications.size)
        card.update(ride,"IN_PROGRESS","Preá → Jijoca")
        assertEquals(1,shadowOf(manager).allNotifications.size)
    }
    @Test fun delayedPreStartSnapshotCannotHideActiveRide() {
        card.update(ride,"IN_PROGRESS","Preá → Jijoca")
        card.update(ride,"DRIVER_ASSIGNED","old snapshot")
        assertEquals(1,shadowOf(manager).allNotifications.size)
    }
    @Test fun lateStartCannotReviveCompletedRide() {
        card.update(ride,"IN_PROGRESS","Preá → Jijoca")
        card.fromPush(ride,"passenger.ride.completed")
        card.fromPush(ride,"passenger.ride.started")
        card.update(ride,"IN_PROGRESS","stale snapshot")
        assertEquals(0,shadowOf(manager).allNotifications.size)
    }
    @Test fun anotherRideCompletionDoesNotClearCurrentRide() {
        card.update(ride,"IN_PROGRESS","Preá → Jijoca")
        card.fromPush("00000000-0000-4000-8000-000000000002","passenger.ride.completed")
        assertEquals(1,shadowOf(manager).allNotifications.size)
    }
    @Test fun logoutClearsAndBlocksDelayedPush() {
        card.update(ride,"IN_PROGRESS","Preá → Jijoca")
        card.disable()
        card.fromPush(ride,"passenger.ride.started")
        assertEquals(0,shadowOf(manager).allNotifications.size)
    }
}
