/* Ride offer sound, unlocked by a real gesture before asynchronous GPS/API work. */
(() => {
  'use strict';
  window.RamoOfferTone = {
    create() {
      const Context = window.AudioContext || window.webkitAudioContext;
      const context = Context ? new Context() : null;
      let vibrating = false;
      let wanted = false;
      let disposed = false;
      let source = null;
      let loading = null;
      let buffer = null;

      function vibrateOnce() {
        if (vibrating || !wanted) return;
        try { vibrating = window.navigator?.vibrate?.([280, 130, 280]) === true; }
        catch (_) { /* Vibration is optional on this browser. */ }
      }

      function load() {
        if (!context) return Promise.resolve();
        if (!loading) {
          loading = fetch(new URL('assets/assets/audio/nova_corrida.mp3?v=2', document.baseURI))
            .then(response => {
              if (!response.ok) throw Error('Offer audio HTTP ' + response.status);
              return response.arrayBuffer();
            })
            .then(bytes => context.decodeAudioData(bytes))
            .then(decoded => { buffer = decoded; })
            .catch(error => { loading = null; throw error; });
        }
        return loading;
      }

      function playIfReady() {
        if (disposed || !wanted || source || !buffer || context?.state !== 'running') return;
        source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(context.destination);
        source.start();
      }

      function arm() {
        if (disposed) return;
        // Call resume synchronously inside the browser's trusted event handler.
        vibrateOnce();
        const resumed = context?.resume();
        Promise.resolve(resumed).then(playIfReady).catch(() => {});
        load().then(playIfReady).catch(() => {});
      }

      function stop() {
        wanted = false;
        if (vibrating) {
          vibrating = false;
          try { window.navigator?.vibrate?.(0); } catch (_) {}
        }
        if (source) {
          source.stop();
          source.disconnect();
          source = null;
        }
      }

      document.addEventListener('pointerdown', arm, true);
      document.addEventListener('keydown', arm, true);
      context?.addEventListener('statechange', playIfReady);
      return {
        async start() {
          if (disposed) return;
          wanted = true;
          vibrateOnce();
          // A blocked context stays armed; the next gesture retries this SAME offer.
          load().then(playIfReady).catch(() => {});
        },
        stop,
        async dispose() {
          if (disposed) return;
          disposed = true;
          stop();
          document.removeEventListener('pointerdown', arm, true);
          document.removeEventListener('keydown', arm, true);
          context?.removeEventListener('statechange', playIfReady);
          await context?.close();
        },
      };
    },
  };
})();
