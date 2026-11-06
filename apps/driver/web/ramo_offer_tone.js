/* Original offer sound, unlocked by a real gesture before asynchronous GPS/API work. */
(() => {
  'use strict';
  window.RamoOfferTone = {
    create() {
      const Context = window.AudioContext || window.webkitAudioContext;
      const context = new Context();
      let wanted = false;
      let disposed = false;
      let source = null;
      let loading = null;
      let buffer = null;

      function load() {
        if (!loading) {
          loading = fetch(new URL('assets/assets/audio/nova_corrida.mp3', document.baseURI))
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
        if (disposed || !wanted || source || !buffer || context.state !== 'running') return;
        source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(context.destination);
        source.start();
      }

      function arm() {
        if (disposed) return;
        // Call resume synchronously inside the browser's trusted event handler.
        const resumed = context.resume();
        Promise.resolve(resumed).then(playIfReady).catch(() => {});
        load().then(playIfReady).catch(() => {});
      }

      function stop() {
        wanted = false;
        if (source) {
          source.stop();
          source.disconnect();
          source = null;
        }
      }

      document.addEventListener('pointerdown', arm, true);
      document.addEventListener('keydown', arm, true);
      context.addEventListener('statechange', playIfReady);
      return {
        async start() {
          if (disposed) return;
          wanted = true;
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
          context.removeEventListener('statechange', playIfReady);
          await context.close();
        },
      };
    },
  };
})();
