package br.com.ramonessa.passenger

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.Editable
import android.text.InputFilter
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import com.mercadopago.sdk.android.coremethods.domain.interactor.coreMethods
import com.mercadopago.sdk.android.coremethods.domain.model.BuyerIdentification
import com.mercadopago.sdk.android.coremethods.domain.model.ResultError
import com.mercadopago.sdk.android.coremethods.domain.utils.Result
import com.mercadopago.sdk.android.coremethods.ui.components.textfield.cardnumber.CardNumberTextFieldEvent
import com.mercadopago.sdk.android.coremethods.ui.components.textfield.cardnumber.xml.CardNumberTextField
import com.mercadopago.sdk.android.coremethods.ui.components.textfield.expirationdate.ExpirationDateTextFieldEvent
import com.mercadopago.sdk.android.coremethods.ui.components.textfield.expirationdate.xml.ExpirationDateTextField
import com.mercadopago.sdk.android.coremethods.ui.components.textfield.securitycode.SecurityCodeTextFieldEvent
import com.mercadopago.sdk.android.coremethods.ui.components.textfield.securitycode.xml.SecurityCodeTextField
import com.mercadopago.sdk.android.domain.model.CountryCode
import com.mercadopago.sdk.android.initializer.MercadoPagoSDK
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.math.BigDecimal

class CardTokenizationActivity : ComponentActivity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private lateinit var cardNumberField: CardNumberTextField
    private lateinit var expirationField: ExpirationDateTextField
    private lateinit var securityField: SecurityCodeTextField
    private lateinit var holderNameField: EditText
    private lateinit var cpfField: EditText
    private lateinit var submitButton: Button
    private lateinit var progress: ProgressBar
    private lateinit var statusText: TextView

    private var paymentMethodId: String? = null
    private var paymentMethodType: String? = null
    private var lastFourDigits: String? = null
    private var cardValid = false
    private var expirationValid = false
    private var securityFilled = false
    private var cpfValid = false
    private var singlePaymentAvailable = false
    private var loadingMethod = false
    private var tokenizing = false
    private var paymentLookupGeneration = 0
    private var amountCents = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        amountCents = intent.getIntExtra(MainActivity.EXTRA_AMOUNT_CENTS, 0)
        if (amountCents <= 0) {
            setResult(
                RESULT_FIRST_USER,
                Intent().putExtra(
                    "error",
                    "Valor da corrida inválido para pagamento por cartão.",
                ),
            )
            finish()
            return
        }

        val publicKey = BuildConfig.MERCADO_PAGO_PUBLIC_KEY.trim()
        if (publicKey.isEmpty()) {
            setResult(
                RESULT_FIRST_USER,
                Intent().putExtra(
                    "error",
                    "Pagamento por cartão ainda não está configurado neste ambiente.",
                ),
            )
            finish()
            return
        }

        try {
            if (!MercadoPagoSDK.isInitialized) {
                MercadoPagoSDK.initialize(
                    context = applicationContext,
                    publicKey = publicKey,
                    countryCode = CountryCode.BRA,
                )
            }
        } catch (error: Throwable) {
            setResult(
                RESULT_FIRST_USER,
                Intent().putExtra(
                    "error",
                    error.message ?: "Não foi possível iniciar o pagamento seguro.",
                ),
            )
            finish()
            return
        }

        window.statusBarColor = BRAND_BLACK
        window.navigationBarColor = BRAND_BLACK
        setContentView(buildContent())
        bindSecureFieldEvents()
        updateSubmitState()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun buildContent(): View {
        val scroll = ScrollView(this).apply {
            setBackgroundColor(BRAND_BLACK)
            isFillViewport = true
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(28), dp(24), dp(36))
        }
        scroll.addView(
            container,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ),
        )

        val mark = TextView(this).apply {
            text = "●  RAMO NESSA"
            setTextColor(BRAND_YELLOW)
            textSize = 21f
            setTypeface(typeface, Typeface.BOLD_ITALIC)
            gravity = Gravity.CENTER
            letterSpacing = 0.02f
        }
        container.addView(mark, fullWidth(dp(44)))

        container.addView(
            TextView(this).apply {
                text = "Cartão protegido"
                setTextColor(Color.WHITE)
                textSize = 28f
                setTypeface(typeface, Typeface.BOLD)
                gravity = Gravity.CENTER
            },
            fullWidth(dp(54)),
        )

        container.addView(
            TextView(this).apply {
                text = "Seus dados são digitados nos campos seguros do Mercado Pago. " +
                    "O Ramo Nessa recebe apenas um token temporário."
                setTextColor(Color.rgb(185, 187, 191))
                textSize = 14f
                gravity = Gravity.CENTER
            },
            fullWidth(dp(72)),
        )

        holderNameField = EditText(this).apply {
            hint = "Nome impresso no cartão"
            setTextColor(BRAND_BLACK)
            setHintTextColor(Color.rgb(115, 118, 123))
            textSize = 16f
            inputType = InputType.TYPE_CLASS_TEXT or
                InputType.TYPE_TEXT_FLAG_CAP_WORDS
            isSingleLine = true
            background = inputBackground()
            setPadding(dp(16), 0, dp(16), 0)
            filters = arrayOf(InputFilter.LengthFilter(80))
            setOnFocusChangeListener { _, _ -> updateSubmitState() }
        }
        container.addView(label("Titular do cartão"))
        container.addView(holderNameField, fullWidth(dp(58)))

        cpfField = EditText(this).apply {
            hint = "CPF do titular"
            setTextColor(BRAND_BLACK)
            setHintTextColor(Color.rgb(115, 118, 123))
            textSize = 16f
            inputType = InputType.TYPE_CLASS_NUMBER
            isSingleLine = true
            background = inputBackground()
            setPadding(dp(16), 0, dp(16), 0)
            filters = arrayOf(InputFilter.LengthFilter(11))
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(
                    s: CharSequence?,
                    start: Int,
                    count: Int,
                    after: Int,
                ) = Unit

                override fun onTextChanged(
                    s: CharSequence?,
                    start: Int,
                    before: Int,
                    count: Int,
                ) {
                    cpfValid = isValidCpf(s?.toString().orEmpty())
                    updateSubmitState()
                }

                override fun afterTextChanged(s: Editable?) = Unit
            })
        }
        container.addView(label("CPF do titular"))
        container.addView(cpfField, fullWidth(dp(58)))

        cardNumberField = CardNumberTextField(this).apply {
            background = inputBackground()
            setPadding(dp(12), dp(4), dp(12), dp(4))
        }
        container.addView(label("Número do cartão"))
        container.addView(cardNumberField, fullWidth(dp(58)))

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }

        val expirationWrap = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(label("Validade"))
        }
        expirationField = ExpirationDateTextField(this).apply {
            background = inputBackground()
            setPadding(dp(12), dp(4), dp(12), dp(4))
        }
        expirationWrap.addView(
            expirationField,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(58),
            ),
        )

        val securityWrap = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(label("CVV"))
        }
        securityField = SecurityCodeTextField(this).apply {
            background = inputBackground()
            setPadding(dp(12), dp(4), dp(12), dp(4))
        }
        securityWrap.addView(
            securityField,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(58),
            ),
        )

        row.addView(
            expirationWrap,
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = dp(6)
            },
        )
        row.addView(
            securityWrap,
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dp(6)
            },
        )
        container.addView(
            row,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ),
        )

        statusText = TextView(this).apply {
            setTextColor(Color.rgb(205, 207, 211))
            textSize = 13f
            gravity = Gravity.CENTER
            text = "Informe os dados do cartão."
            setPadding(0, dp(18), 0, dp(8))
        }
        container.addView(statusText, fullWidth(dp(58)))

        progress = ProgressBar(this).apply {
            visibility = View.GONE
            isIndeterminate = true
        }
        container.addView(
            progress,
            LinearLayout.LayoutParams(dp(32), dp(32)).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                bottomMargin = dp(10)
            },
        )

        submitButton = Button(this).apply {
            text = "Continuar com segurança"
            setTextColor(BRAND_BLACK)
            textSize = 16f
            isAllCaps = false
            setTypeface(typeface, Typeface.BOLD)
            background = rounded(BRAND_YELLOW, dp(18).toFloat())
            setOnClickListener { tokenize() }
        }
        container.addView(submitButton, fullWidth(dp(58)).apply {
            topMargin = dp(8)
        })

        container.addView(
            TextView(this).apply {
                text = "Proteção PCI · Mercado Pago"
                setTextColor(Color.rgb(128, 131, 136))
                textSize = 12f
                gravity = Gravity.CENTER
                setPadding(0, dp(20), 0, 0)
            },
            fullWidth(dp(42)),
        )

        return scroll
    }

    private fun bindSecureFieldEvents() {
        cardNumberField.onEvent = { event ->
            when (event) {
                is CardNumberTextFieldEvent.OnBinChanged -> {
                    val bin = event.cardBin.orEmpty()
                    if (bin.length >= 6) {
                        loadPaymentMethod(bin)
                    } else {
                        paymentLookupGeneration += 1
                        paymentMethodId = null
                        paymentMethodType = null
                        singlePaymentAvailable = false
                        loadingMethod = false
                        updateSubmitState()
                    }
                }
                is CardNumberTextFieldEvent.IsValid -> {
                    cardValid = event.isValid
                    updateSubmitState()
                }
                is CardNumberTextFieldEvent.OnLastFourDigitsFilled -> {
                    lastFourDigits = event.lastFourDigits
                }
                else -> Unit
            }
        }

        expirationField.onEvent = { event ->
            if (event is ExpirationDateTextFieldEvent.IsValid) {
                expirationValid = event.isValid
                updateSubmitState()
            }
        }

        securityField.onEvent = { event ->
            if (event is SecurityCodeTextFieldEvent.OnInputFilled) {
                securityFilled = event.isFilled
                updateSubmitState()
            }
        }
    }

    private fun loadPaymentMethod(bin: String) {
        val generation = ++paymentLookupGeneration
        loadingMethod = true
        singlePaymentAvailable = false
        paymentMethodId = null
        paymentMethodType = null
        statusText.text = "Validando seu cartão para pagamento à vista…"
        updateSubmitState()

        scope.launch {
            try {
                val coreMethods = MercadoPagoSDK.getInstance().coreMethods
                val methodResult = coreMethods.getPaymentMethods(bin = bin)
                if (generation != paymentLookupGeneration) return@launch

                when (methodResult) {
                    is Result.Success -> {
                        val method = methodResult.data.firstOrNull()
                        val methodId = method?.id
                        val methodType = method?.paymentTypeId

                        if (
                            methodId.isNullOrBlank() ||
                            (methodType != "credit_card" &&
                                methodType != "debit_card")
                        ) {
                            statusText.text =
                                "Este cartão não está disponível para pagamento."
                            return@launch
                        }

                        method.card?.length?.max?.let {
                            cardNumberField.maxLength = it
                        }
                        method.card?.securityCode?.length?.let {
                            securityField.securityCodeSize = it
                        }

                        val installmentResult = coreMethods.getInstallments(
                            bin = bin,
                            amount = BigDecimal.valueOf(
                                amountCents.toLong(),
                                2,
                            ),
                        )
                        if (generation != paymentLookupGeneration) return@launch

                        when (installmentResult) {
                            is Result.Success -> {
                                val supportsSinglePayment =
                                    installmentResult.data.any { option ->
                                        option.payerCost.orEmpty().any { cost ->
                                            cost.instalments == 1
                                        }
                                    }

                                if (!supportsSinglePayment) {
                                    statusText.text =
                                        "Este cartão não permite pagamento à vista " +
                                            "para este valor."
                                    return@launch
                                }

                                paymentMethodId = methodId
                                paymentMethodType = methodType
                                singlePaymentAvailable = true
                                statusText.text =
                                    "Cartão válido para pagamento à vista."
                            }
                            is Result.Error -> {
                                statusText.text =
                                    "Não conseguimos validar o pagamento à vista agora."
                            }
                        }
                    }
                    is Result.Error -> {
                        statusText.text = when (val error = methodResult.error) {
                            is ResultError.Request -> error.message
                            is ResultError.Validation -> error.message
                        }
                    }
                }
            } catch (_: Throwable) {
                if (generation == paymentLookupGeneration) {
                    paymentMethodId = null
                    paymentMethodType = null
                    singlePaymentAvailable = false
                    statusText.text =
                        "Não conseguimos validar este cartão agora."
                }
            } finally {
                if (generation == paymentLookupGeneration) {
                    loadingMethod = false
                    updateSubmitState()
                }
            }
        }
    }

    private fun tokenize() {
        if (tokenizing) return

        val holder = holderNameField.text.toString().trim()
        if (holder.length < 2) {
            statusText.text = "Informe o nome do titular do cartão."
            holderNameField.requestFocus()
            return
        }

        val cpf = cpfField.text.toString().filter(Char::isDigit)
        if (!isValidCpf(cpf)) {
            statusText.text = "Informe um CPF válido do titular."
            cpfField.requestFocus()
            return
        }

        val methodId = paymentMethodId
        val methodType = paymentMethodType
        if (
            loadingMethod ||
            !singlePaymentAvailable ||
            !cardValid ||
            !expirationValid ||
            !securityFilled ||
            methodId.isNullOrBlank() ||
            (methodType != "credit_card" && methodType != "debit_card")
        ) {
            statusText.text = "Confira os dados do cartão para continuar."
            return
        }

        tokenizing = true
        progress.visibility = View.VISIBLE
        statusText.text = "Protegendo seus dados…"
        updateSubmitState()

        scope.launch {
            try {
                val result = MercadoPagoSDK.getInstance().coreMethods
                    .generateCardToken(
                        cardNumberState = cardNumberField.state,
                        expirationDateState = expirationField.state,
                        securityCodeState = securityField.state,
                        buyerIdentification = BuyerIdentification(
                            name = holder,
                            number = cpf,
                            type = "CPF",
                        ),
                    )

                when (result) {
                    is Result.Success -> {
                        setResult(
                            Activity.RESULT_OK,
                            Intent().apply {
                                putExtra("token", result.data.token)
                                putExtra("paymentMethodId", methodId)
                                putExtra("paymentMethodType", methodType)
                                putExtra(
                                    "lastFourDigits",
                                    result.data.lastFourDigits ?: lastFourDigits,
                                )
                            },
                        )
                        finish()
                    }
                    is Result.Error -> {
                        statusText.text = when (val error = result.error) {
                            is ResultError.Request -> error.message
                            is ResultError.Validation -> error.message
                        }
                    }
                }
            } catch (error: Throwable) {
                statusText.text =
                    error.message ?: "Não conseguimos proteger o cartão agora."
            } finally {
                tokenizing = false
                progress.visibility = View.GONE
                updateSubmitState()
            }
        }
    }

    private fun updateSubmitState() {
        if (!::submitButton.isInitialized) return
        submitButton.isEnabled =
            !tokenizing &&
            !loadingMethod &&
            cpfValid &&
            singlePaymentAvailable &&
            cardValid &&
            expirationValid &&
            securityFilled &&
            !paymentMethodId.isNullOrBlank() &&
            (paymentMethodType == "credit_card" || paymentMethodType == "debit_card")
        submitButton.alpha = if (submitButton.isEnabled) 1f else 0.45f
    }

    private fun isValidCpf(value: String): Boolean {
        val digits = value.filter(Char::isDigit)
        if (digits.length != 11 || digits.toSet().size == 1) return false

        fun checkDigit(length: Int): Int {
            var sum = 0
            var weight = length + 1
            for (index in 0 until length) {
                sum += (digits[index] - '0') * weight
                weight -= 1
            }
            val remainder = (sum * 10) % 11
            return if (remainder == 10) 0 else remainder
        }

        return checkDigit(9) == (digits[9] - '0') &&
            checkDigit(10) == (digits[10] - '0')
    }

    private fun label(text: String) = TextView(this).apply {
        this.text = text
        setTextColor(Color.WHITE)
        textSize = 13f
        setTypeface(typeface, Typeface.BOLD)
        setPadding(2, dp(16), 0, dp(7))
    }

    private fun inputBackground(): GradientDrawable =
        rounded(Color.WHITE, dp(16).toFloat())

    private fun rounded(color: Int, radius: Float) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = radius
    }

    private fun fullWidth(height: Int) = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        height,
    )

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val BRAND_BLACK = 0xFF0D0D0D.toInt()
        private const val BRAND_YELLOW = 0xFFFAD50E.toInt()
    }
}
