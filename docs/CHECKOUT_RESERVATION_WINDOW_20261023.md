# Independent payment window and driver hold

Application revision: `032e973b552bcfad3208450630cbd5f9181ef2d1`, based on `ops/local-guide-web-20261022` at `e84e33da018375230bfaee26bf4c7ec633d9bf9d`. Published in DRAFT PR #41; no main merge. The VPS has not yet been changed for this checkout update.

New passenger bookings reserve an eligible driver exclusively for 60 seconds and have a separate 600-second checkout deadline. No driver offer is sent before payment. Existing reservation comparisons release eligibility at `reserved_until <= now`; expired metadata does not continue excluding the driver and must not be rewritten to make old GPS look fresh. Another passenger can reserve that driver after 60 seconds. A confirmed payment within the checkout window prefers the original reservation only while active, and otherwise ranks currently online/available drivers with fresh GPS, correct category, capacity, radius and compliance. The prepared fare remains unchanged.

An additive nullable `rides.payment_expires_at` column persists the independent deadline. Preparation, creation, reads, saves and matching projections include it. Historical rides without the field retain their existing deadlines. Consent-before-payment bookings also keep their original driver hold, even if a checkout field is present.

Payment creation for card/Pix, wallet, cash authorization, free promotional payment and late external confirmation use checkout expiry rather than exclusive-driver-hold expiry. Invalid deadlines fail closed. Confirmation after the checkout deadline retains the existing refund path. No-driver dispatch retains cancellation/retry and the existing automatic timeout refund.

Coupon reservations last until checkout expiry. The legacy response field `holdExpiresAt` remains the checkout deadline for existing clients; `paymentExpiresAt` and `driverReservationExpiresAt` explicitly distinguish the deadlines. Flutter parsing and card/Pix wording describe the time to pay. The ADM explains that the pre-acceptance hold setting does not control the new fixed 60-second reservation.

## Validation

Full Preflight passed at application revision `032e973b` (run `39891912020`) and again with the installer at `83002327` (run `39893591457`): 867 Core tests passed, 11 skipped for specific runtime conditions, 169 ADM tests, 227 Passenger tests and 111 Driver tests passed. TypeScript check/build and Flutter analysis passed. The actual PostgreSQL test covers persistence, release after 60 seconds and dispatch to another driver after payment; migration re-execution is idempotent.

Configured Web packaging and isolated Docker rehearsal are tracked by workflow `checkout-web-package.yml`. The package requires the exact reviewed application revision, compiled Core delta, complete ADM manifests, unchanged dependency lock and old migrations, production same-origin Web configuration, Chromium/WebKit session regressions, real restore-tested backup, both automatic rollback paths and unchanged GPS policies. Run `39894279007` passed packaging, both browser engines and the complete Docker rehearsal. The initial upload step was retried after pinning the tested application revision in branch `release/checkout-window-032e973b`; the final publication succeeded. No workflow deploys to the VPS.

Published prerelease: `checkout-window-web-032e973b`. ZIP SHA-256: `6d5712bcaf0a7ffc304d412630af34ea9518abd7524069ff18bc70f5a54288d1`. Installer revision: `c5bd432754e65beec8c452c4d1206dbd50f5f0dc`; source archive SHA-256: `2e1adf2e21f26ea633b4e2d3e05448ed69729dec0eed7ab28d927dbb3aecee44`. The public package matches the exact tested Actions artifact (`12475882902`, outer ZIP SHA-256 `0db18d798788bd93e6b6ee438b3c29a79b7a748d7e3d4494e4429b036885014d`).

## Scoped VPS installation

The read-only inventory supplied by the operator on 2026-10-23 pinned:

- Core image: `sha256:6459a320df3e4f44630b11787d6a6ac1b9fab148434ff4d9a81f3b9b55d64d05`.
- Gateway image: `sha256:774b326e9a1b93af512be0cd1e88a42ef9373ffa0bb043002dbd622f30138051`.
- Active self-contained models: `/opt/ramo-nessa-local-guide/9f294f81fe6d/{core,gateway}-after.private.json`.
- Active Web: `/opt/ramo-nessa-web/releases/guide-9f294f81fe6d/bundles`.
- Mounted Caddy configuration: `/home/ubuntu/ramo-nessa-v5-3f3aad573667/deploy/staging/Caddyfile`, including the live GPS correction.

Installer `deploy/staging/checkout-web-update.mjs` accepts `prepare ABSOLUTE_ZIP SHA256`, `activate PREPARED_DIRECTORY PLAN_SHA256`, or `install ABSOLUTE_ZIP SHA256` for the sequential combination. Preparation does not restart active services. It verifies runtime fingerprints/configuration and backup restoration, builds offline file overlays over the exact active image IDs, copies the existing Driver Web unchanged and stages the new Passenger Web separately. Configurations and receipts remain root-private under `/opt/ramo-nessa-checkout-window/032e973b552b`.

Activation rechecks the plan, runtime, images, active pricing snapshot, Web bytes and mounted Caddy bytes before applying only migration 088 and switching Core, then Gateway. Existing environment values, provider credentials/settings, mounts, networks, security options and unrelated services are preserved. HTTP checks verify published bundle bytes, health, Guide compatibility/authentication and GPS allowed only for Passenger/Driver. Failed switches restore verified previous service models; the additive column stays and no old financial database is restored.

After a successful VPS result, reopen Passenger Web and prepare a new ride to verify the ten-minute checkout. Complete a controlled payment after the first minute and confirm the eligible driver receives the offer. Physical-device acceptance and a real card/refund remain pending. Native Android/iOS packages are not generated or distributed by this Web rollout; shipped clients receive the compatible deadline from the API, while native wording requires a later native release.
