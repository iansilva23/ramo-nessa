(() => {
  const installed = matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true;
  const pending = 'ramo.google.redirect:' + location.pathname;
  globalThis.ramoGoogleUsesRedirect = () => installed;
  globalThis.ramoGoogleRedirectPending = () => sessionStorage.getItem(pending) === '1';
  globalThis.ramoSetGoogleRedirectPending = value => {
    if (value) sessionStorage.setItem(pending, '1');
    else sessionStorage.removeItem(pending);
  };
  addEventListener('pageshow', event => {
    if (event.persisted && installed && globalThis.ramoGoogleRedirectPending()) location.reload();
  });

  // Match the version pinned by firebase_core_web in both apps.
  const sdk = 'https://www.gstatic.com/firebasejs/12.19.0/';
  let loading;
  globalThis.ramoPrepareFirebaseAuth = () => loading ??= (async () => {
    const core = await import(sdk + 'firebase-app.js');
    const [auth, messaging] = await Promise.all([
      import(sdk + 'firebase-auth.js'),
      import(sdk + 'firebase-messaging.js'),
    ]);
    // FlutterFire skips its inline loader when firebase_core is already present.
    Object.assign(globalThis, {
      firebase_auth: auth,
      firebase_messaging: messaging,
      firebase_core: core,
    });
  })().catch(error => {
    loading = undefined;
    throw error;
  });
  globalThis.ramoPrepareFirebaseAuth().catch(() => {});
})();
