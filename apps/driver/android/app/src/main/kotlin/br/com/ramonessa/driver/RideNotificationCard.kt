package br.com.ramonessa.driver

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.View
import android.widget.RemoteViews

/** Native notification content; uses no provider, location service or ride mutation. */
internal object RideNotificationCard {
    fun views(context: Context, title: String, detail: String, active: Boolean,
              destination: String = "", eta: String = "", identity: String = "",
              progress: Double? = null, category: String = "car", expanded: Boolean = true): RemoteViews {
        val layout = if (expanded) R.layout.ramo_ride_notification_expanded else R.layout.ramo_ride_notification_compact
        val views = RemoteViews(context.packageName, layout)
        views.setTextViewText(R.id.ride_title, title.take(100))
        val location = if (active && destination.isNotBlank()) "Destino: ${destination.take(100)}" else detail.take(300)
        views.setTextViewText(R.id.ride_destination, location)
        if (expanded) {
            views.setInt(R.id.ride_destination, "setMaxLines", if (active) 2 else 4)
            views.setViewVisibility(R.id.ride_eta, if (active && eta.isNotBlank()) View.VISIBLE else View.GONE)
            views.setTextViewText(R.id.ride_eta, eta.take(100))
            views.setViewVisibility(R.id.ride_identity, if (active && identity.isNotBlank()) View.VISIBLE else View.GONE)
            views.setTextViewText(R.id.ride_identity, identity.take(120))
            views.setViewVisibility(R.id.ride_journey, if (active) View.VISIBLE else View.GONE)
            if (active) {
                views.setImageViewBitmap(R.id.ride_progress, journey(progress, category))
                views.setContentDescription(R.id.ride_progress,
                    if (progress != null && progress.isFinite()) "Percurso estimado: ${(progress.coerceIn(0.0, 1.0) * 100).toInt()}%" else "Percurso aguardando localização atualizada")
            }
            views.setTextViewText(R.id.ride_footer, if (active) "Toque para acompanhar" else "Toque para abrir o app")
        }
        return views
    }

    private fun journey(raw: Double?, category: String): Bitmap {
        val bitmap = Bitmap.createBitmap(800, 88, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        val yellow = Color.rgb(255, 190, 0)
        p.strokeWidth = 7f; p.strokeCap = Paint.Cap.ROUND; p.color = Color.rgb(225, 225, 225)
        canvas.drawLine(20f, 51f, 770f, 51f, p)
        val known = raw != null && raw.isFinite()
        val fraction = if (known) raw!!.coerceIn(0.0, 1.0).toFloat() else 0f
        if (known) { p.color = yellow; canvas.drawLine(20f, 51f, 20f + 750f * fraction, 51f, p) }
        p.style = Paint.Style.FILL; p.color = Color.WHITE; canvas.drawCircle(20f, 51f, 14f, p)
        p.style = Paint.Style.STROKE; p.strokeWidth = 5f; p.color = yellow; canvas.drawCircle(20f, 51f, 14f, p)
        p.style = Paint.Style.FILL
        val pin = Path().apply { moveTo(780f, 49f); cubicTo(769f, 32f, 757f, 22f, 762f, 12f); cubicTo(770f, -4f, 794f, -4f, 800f, 12f); cubicTo(804f, 23f, 790f, 36f, 780f, 49f); close() }
        p.color = yellow; canvas.drawPath(pin, p); p.color = Color.rgb(70, 55, 10); canvas.drawCircle(780f, 15f, 4f, p)
        // Unknown progress has no artificial half-complete segment or vehicle position.
        if (!known) return bitmap
        canvas.save(); canvas.translate((20f + 750f * fraction).coerceIn(50f, 730f), 48f)
        p.color = Color.rgb(16, 17, 20); p.strokeWidth = 4f
        if (category in setOf("motorcycle", "mototaxi", "delivery", "moto")) {
            p.style = Paint.Style.STROKE; canvas.drawCircle(-20f, 4f, 11f, p); canvas.drawCircle(20f, 4f, 11f, p)
            canvas.drawLine(-20f, 4f, -7f, -16f, p); canvas.drawLine(-7f, -16f, 20f, 4f, p)
            canvas.drawLine(-7f, -16f, 7f, 4f, p); canvas.drawLine(7f, 4f, -20f, 4f, p)
            canvas.drawLine(20f, 4f, 11f, -25f, p); canvas.drawLine(11f, -25f, 22f, -25f, p)
            p.color = yellow; p.strokeWidth = 9f; canvas.drawLine(-12f, -15f, 5f, -15f, p)
        } else {
            p.style = Paint.Style.FILL; p.color = yellow
            val car = Path().apply { moveTo(-37f, 3f); lineTo(-35f, -15f); lineTo(-22f, -18f); lineTo(-13f, -33f); lineTo(13f, -33f); lineTo(25f, -17f); lineTo(36f, -13f); lineTo(38f, 3f); close() }
            canvas.drawPath(car, p); p.color = Color.rgb(16, 17, 20); p.style = Paint.Style.STROKE; canvas.drawPath(car, p)
            p.style = Paint.Style.FILL; p.color = Color.rgb(219, 235, 246)
            canvas.drawRect(RectF(-10f, -29f, 1f, -18f), p); canvas.drawRect(RectF(5f, -29f, 13f, -18f), p)
            p.color = Color.rgb(16, 17, 20); canvas.drawCircle(-23f, 4f, 9f, p); canvas.drawCircle(23f, 4f, 9f, p)
            p.color = Color.WHITE; canvas.drawCircle(-23f, 4f, 4f, p); canvas.drawCircle(23f, 4f, 4f, p)
        }
        canvas.restore()
        return bitmap
    }
}

