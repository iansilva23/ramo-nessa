package br.com.ramonessa.passenger

import android.app.Activity
import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var pendingCardResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            PAYMENT_CHANNEL,
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "tokenizeCard" -> openCardTokenization(call.arguments, result)
                else -> result.notImplemented()
            }
        }
    }

    private fun openCardTokenization(
        arguments: Any?,
        result: MethodChannel.Result,
    ) {
        if (pendingCardResult != null) {
            result.error(
                "CARD_FLOW_ACTIVE",
                "Já existe um cartão sendo preenchido.",
                null,
            )
            return
        }

        val amountCents =
            ((arguments as? Map<*, *>)?.get("amountCents") as? Number)
                ?.toInt()
        if (amountCents == null || amountCents <= 0) {
            result.error(
                "CARD_AMOUNT_INVALID",
                "Valor da corrida inválido para validar o cartão.",
                null,
            )
            return
        }

        val publicKey =
            ((arguments as? Map<*, *>)?.get("publicKey") as? String)
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
                ?: BuildConfig.MERCADO_PAGO_PUBLIC_KEY.trim()
        if (publicKey.isBlank()) {
            result.error(
                "MERCADO_PAGO_NOT_CONFIGURED",
                "Public Key do Mercado Pago não configurada neste ambiente.",
                null,
            )
            return
        }

        pendingCardResult = result
        startActivityForResult(
            Intent(this, CardTokenizationActivity::class.java).apply {
                putExtra(EXTRA_AMOUNT_CENTS, amountCents)
                putExtra("requestStorageToken", (arguments as? Map<*, *>)?.get("requestStorageToken") == true)
                putExtra(EXTRA_MERCADO_PAGO_PUBLIC_KEY, publicKey)
                for (key in listOf("savedCardId", "paymentMethodId", "paymentMethodType", "lastFourDigits")) {
                    putExtra(key, (arguments as? Map<*, *>)?.get(key) as? String)
                }
            },
            CARD_REQUEST_CODE,
        )
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
    ) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != CARD_REQUEST_CODE) return

        val result = pendingCardResult
        pendingCardResult = null
        if (result == null) return

        when (resultCode) {
            Activity.RESULT_OK -> {
                val token = data?.getStringExtra("token")
                val paymentMethodId =
                    data?.getStringExtra("paymentMethodId")
                val paymentMethodType =
                    data?.getStringExtra("paymentMethodType")

                if (
                    token.isNullOrBlank() ||
                    paymentMethodId.isNullOrBlank() ||
                    paymentMethodType.isNullOrBlank()
                ) {
                    result.error(
                        "CARD_TOKEN_INVALID",
                        "O Mercado Pago não retornou um token válido.",
                        null,
                    )
                    return
                }

                result.success(
                    mapOf(
                        "token" to token,
                        "storageToken" to data?.getStringExtra("storageToken"),
                        "paymentMethodId" to paymentMethodId,
                        "paymentMethodType" to paymentMethodType,
                        "lastFourDigits" to
                            data.getStringExtra("lastFourDigits"),
                    ),
                )
            }
            Activity.RESULT_FIRST_USER -> {
                result.error(
                    "MERCADO_PAGO_NOT_CONFIGURED",
                    data?.getStringExtra("error")
                        ?: "Mercado Pago não configurado.",
                    null,
                )
            }
            else -> {
                result.error(
                    "CARD_CANCELLED",
                    "Cadastro do cartão cancelado.",
                    null,
                )
            }
        }
    }

    companion object {
        private const val PAYMENT_CHANNEL =
            "br.com.ramonessa.passenger/payments"
        const val EXTRA_AMOUNT_CENTS = "amountCents"
        const val EXTRA_MERCADO_PAGO_PUBLIC_KEY =
            "mercadoPagoPublicKey"
        private const val CARD_REQUEST_CODE = 8042
    }
}
