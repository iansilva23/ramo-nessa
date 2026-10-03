# Ride confirmation and payment experience

The passenger chooses the route/category, explicitly approves a wider search when allowed, receives a nearby driver's acceptance, and confirms that driver before payment. Offers last up to 35 seconds. The existing exclusive payment hold and backend payment/late-Pix/refund rules remain authoritative.

## Motion

Shared components live in `packages/design_system/lib/src/motion/ramo_ride_motion.dart`.

- Search pulses, sequential driver-card reveals, success marks and offer countdowns do not change business state.
- Reduced motion disables looping and entry transitions. Countdown semantics avoid duplicate screen-reader announcements.
- The passenger's pickup coordinates drive the optional search map. The driver map fits the actual driver/embark coordinates once per offer, without inventing positions or arrival estimates.
- A confirmed-payment animation only runs after the tracking API reports a paid/assigned state; refund/unavailable states bypass success.
- Driver system sound/haptics depend on platform/device settings. No custom repeating sound or silent-mode override is used.

## Card registration and saved cards

The Flutter review screen separates adding/selecting a card from confirming the charge. Secure native Mercado Pago fields remain on Android/iOS; sensitive fields never move into Flutter, logs, local preferences or Core.

Saving is opt-in. When selected, the native SDK generates **separate one-use tokens** for the charge and gateway storage. Only a gateway customer/card identifier and masked metadata persist in migration 076. Reuse creates a fresh token through secure SDK fields; the gateway may request CVV/additional cardholder validation and bank authentication.

`GET/POST /v1/passenger/cards` and `DELETE /v1/passenger/cards/:id` require the passenger identity. Core owns the customer association and checks the saved card before sending `payer.customer_id` to the Orders API. Clients cannot supply a customer identifier. An existing customer is never adopted merely because its email matches a client-supplied email.

Metadata is isolated by gateway credential fingerprint, preventing test/production credential changes from exposing an unrelated vault. After changing the gateway credential, previously saved cards under that credential must be registered again. Gateway or network errors display an explicit failure; registration does not silently charge a ride.

## Verification

Core tests cover passenger/credential separation, masked gateway payloads, customer-linked Orders, invalid card IDs, single-installment enforcement and PostgreSQL persistence. Widget tests cover review before payment, email validation, opt-in storage with separate tokens, expired reservations and reduced motion. Existing matching, cancellation, refund and payment suites still run.

Release requires the normal Android/iOS builds, an authenticated test-device check and a Mercado Pago sandbox test of save/reuse/remove, refused payments and 3DS. Preview fixtures are demonstrations and do not establish live gateway or reservation correctness.

Sources: [saved cards](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/improve-payment-approval/saved-cards), [secure mobile card fields](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/mobile/cards), Mercado Pago iOS `CoreMethods.createToken(cardID:securityCode:)`.
