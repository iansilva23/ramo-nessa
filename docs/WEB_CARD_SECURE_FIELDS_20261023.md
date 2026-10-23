# Secure Fields initialization on Passenger Web

The operator reported that only the local cardholder name/CPF inputs worked. Number, expiration and CVV disappeared with the generic secure-form initialization error. The public Passenger CSP was read directly and compared to the installed bridge and the live Mercado Pago JavaScript SDK.

The provider SDK performs a fetch preflight to `https://secure-fields.mercadopago.com/`, falling back to `https://api-static.mercadopago.com/secure-fields`, before setting the protected iframe URLs. Both are already covered by the frame-src policy but were missing from connect-src. The denied preflight prevents field initialization and the bridge disposes the failed session, explaining the disappearing fields. Card data has not been entered in the diagnostic.

The policy patch adds exactly those two origins to Passenger connect-src. Other directives and other application scopes are unchanged. The source Caddyfile also retains the default `?Permissions-Policy` already applied on the VPS, which lets the specific Passenger/Driver GPS policies take precedence. No Flutter application, card bridge, Core source, dependency lock or migration is changed by this fix. The checkout deadline update was already applied successfully by the operator before this report.

## Operational repair

`deploy/staging/fix-web-card-csp.mjs --apply` is a self-contained Node script executed with sudo. It reads the current mounted Caddyfile rather than replacing it with a repository snapshot. It verifies the running gateway process/mount/health and current HTTPS responses, creates a private configuration backup, validates with the actual Caddy binary, and tests both adapted policies in an isolated, read-only, networkless container using the current gateway image and existing read-only Web files.

Only after the rehearsal does the script write the changed connection directive in place, preserving the mounted inode, then reload Caddy by SIGUSR1. It verifies the public CSP with rendered host placeholders, existing GPS policies, unchanged Web bytes and unchanged service image/container/start identities. If verification fails, it restores the original Caddy bytes and checks the previous HTTPS policy. It never restores an old database, calls payment APIs, replaces bundles, restarts Core/PostgreSQL or changes credentials.

The isolated Caddy container keeps only NET_BIND_SERVICE from the capability set because the upstream Caddy executable carries that file capability; dropping it from the bounding set prevents the binary from executing even on a high port. No existing service capability is changed.

## Verification

Four local tests cover the exact scope and idempotence, missing/ambiguous/partially fixed policies, mounted-inode writes with shortening on rollback and concurrency rejection, and invalid gateway identity. A real Docker/Caddy HTTP test checks production-adapted routes, both GPS policies, the ADM restrictions, reload and rollback without container restart.

Existing browser tests cover protected-field isolation, payment/storage token separation, cancellation, stale BIN responses, allowed single-installment methods and safe provider error handling. The live-provider test uses the real SDK and real iframe pages with a synthetic public key; it reproduces both denied preflight origins under the old policy, and verifies three editable provider-owned inputs under the fixed policy. It does not type card information, create tokens or submit a payment. Security regressions retain inline-script, foreign-script and foreign-form restrictions for Passenger, Driver and ADM in Chromium/WebKit.

Validation passed on installer/test revision `f7235b6b5327619688a95da6e35a5498f4f06643`, workflow run `39899321393`: 4 repair-contract tests, the real Docker/Caddy HTTP reload/rollback, 9 existing protected-card tests, and 8 security/live-SDK tests in each of Chromium and WebKit. Both engines reproduced the denied preflight and then initialized three visible, editable provider-owned fields under the corrected policy. Physical-device payment acceptance remains pending.

Repair script SHA-256: `d9c6631a06674634de0b259e08064765f85be4f6443635d90839513b7886db0e`. Its public, revision-pinned source is `/iansilva23/ramo-nessa/f7235b6b5327619688a95da6e35a5498f4f06643/deploy/staging/fix-web-card-csp.mjs` on raw.githubusercontent.com. No VPS mutation has been performed by the agent for this repair.

After the operator applies the repair, close the failed card screen and reopen Passenger Web before preparing a new checkout. First confirm that number, expiration and CVV load. Acceptance on the physical Android devices, a real card payment, driver dispatch and refund remain separate pending checks.
