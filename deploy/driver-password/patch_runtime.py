"""Add only driver auth wiring to the already installed compiled runtime."""

def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def apply(text, changes):
    original = text
    for old, new in changes:
        require(text.count(old) == 1 and new not in text, 'Runtime divergente; alteração recusada.')
        text = text.replace(old, new, 1)
    restored = text
    for old, new in reversed(changes):
        require(restored.count(new) == 1, 'Alteração fora do escopo.')
        restored = restored.replace(new, old, 1)
    require(restored == original, 'Preservação do runtime não confirmada.')
    return text


def server(text):
    require('driverPasswordAuthStore' not in text, 'Login já instalado; nada repetido.')
    start = 'const { guideStore, asaasPayoutStore, authSessionRepository, authOtpRepository,'
    route = "        if (request.method === 'POST' &&\n            (requestUrl.pathname === '/v1/auth/otp/request' || requestUrl.pathname === '/v1/auth/driver-registration/request')) {"
    call = """        if (await handleDriverPasswordAuthRoute({ request, response, pathname: requestUrl.pathname,
            dependencies: { identities: authOtpRepository, sessions: authSessionRepository, store: driverPasswordAuthStore, rateLimitSecret: authRateLimitSecret },
            delivery: otpDeliveryProvider, readJson, json,
            clientIp: requestClientIp(request), clientInstanceId: headerValue(request, 'x-client-instance-id') }))
            return;
"""
    return "import { handleDriverPasswordAuthRoute } from './auth/driver-password-auth-routes.js';\n" + apply(text, [(start, start + ' driverPasswordAuthStore,'), (route, call + route)])


def repositories(text):
    require('driverPasswordAuthStore' not in text, 'Repositório já configurado.')
    return "import { InMemoryDriverPasswordAuthStore, PostgresDriverPasswordAuthStore } from '../auth/driver-password-auth-store.js';\n" + apply(text, [
        ('\n        return {\n', '\n        return {\n            driverPasswordAuthStore: new PostgresDriverPasswordAuthStore(pool),\n'),
        ('    const financeRepository = new InMemoryFinanceRepository();', '    const driverAuthIdentities = new InMemoryAuthOtpRepository();\n    const financeRepository = new InMemoryFinanceRepository();'),
        ('\n    return {\n', '\n    return {\n        driverPasswordAuthStore: new InMemoryDriverPasswordAuthStore(driverAuthIdentities),\n'),
        ('authOtpRepository: new InMemoryAuthOtpRepository(),', 'authOtpRepository: driverAuthIdentities,'),
    ])


def previous_otp(text):
    # Recognize the exact optional-controls live patch shipped before this feature.
    changes = [
        ('const phoneE164 = normalizeBrazilMobilePhone(input.phone);', "const whatsappControlsDisabled = input.delivery.externalProvider === 'entrar-whatsapp' && process.env.WHATSAPP_OTP_ABUSE_CONTROLS === 'disabled';\n    const phoneE164 = normalizeBrazilMobilePhone(input.phone);"),
        ('await enforceOtpRequestRateLimits({', 'if (!whatsappControlsDisabled) await enforceOtpRequestRateLimits({'),
        ('Math.ceil(OTP_COOLDOWN_MS / 1000)', 'Math.ceil((whatsappControlsDisabled ? 0 : OTP_COOLDOWN_MS) / 1000)'),
        ('cooldownMs: OTP_COOLDOWN_MS', 'cooldownMs: whatsappControlsDisabled ? 0 : OTP_COOLDOWN_MS'),
    ]
    for old, new in changes:
        require(text.count(old) == (2 if old.startswith('Math.ceil') else 1), 'Base OTP divergente.')
        text = text.replace(old, new)
    start = text.index('const reserved = await input.repository.beginExternalVerification({')
    end = text.index('});', start)
    part = text[start:end]
    old = 'maxAttempts: OTP_MAX_ATTEMPTS'
    require(part.count(old) == 1, 'Base OTP divergente.')
    return text[:start] + part.replace(old, "maxAttempts: process.env.WHATSAPP_OTP_ABUSE_CONTROLS === 'disabled' ? 2147483647 : OTP_MAX_ATTEMPTS") + text[end:]
