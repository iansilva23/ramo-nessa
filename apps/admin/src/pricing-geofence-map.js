const TILE_SIZE = 256;
const DEFAULT_CENTER = {
  latitude: -2.84,
  longitude: -40.44,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function project(latitude, longitude, zoom) {
  const lat = clamp(latitude, -85.05112878, 85.05112878);
  const sin = Math.sin((lat * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    x: ((longitude + 180) / 360) * scale,
    y:
      (0.5 -
        Math.log((1 + sin) / (1 - sin)) /
          (4 * Math.PI)) *
      scale,
  };
}

function unproject(x, y, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const latitude =
    (180 / Math.PI) *
    Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { latitude, longitude };
}

function normalizeTileX(x, zoom) {
  const count = 2 ** zoom;
  return ((x % count) + count) % count;
}

function createTile(url, left, top) {
  const image = document.createElement('img');
  image.src = url;
  image.alt = '';
  image.draggable = false;
  image.referrerPolicy = 'strict-origin-when-cross-origin';
  image.className = 'pricing-geofence-map__tile';
  image.style.left = `${left}px`;
  image.style.top = `${top}px`;
  return image;
}

function metersPerPixel(latitude, zoom) {
  return (
    156543.03392 *
    Math.cos((latitude * Math.PI) / 180) /
    2 ** zoom
  );
}

export function createPricingGeofenceMap(input) {
  const root = input.root;
  const tiles = input.tiles;
  const overlay = input.overlay;
  const zoomIn = input.zoomIn;
  const zoomOut = input.zoomOut;
  const onChange =
    typeof input.onChange === 'function' ? input.onChange : () => {};

  let zoom = 12;
  let center = { ...DEFAULT_CENTER };
  let selection = {
    latitude: DEFAULT_CENTER.latitude,
    longitude: DEFAULT_CENTER.longitude,
    radiusKm: 2,
  };
  let pointer = null;

  function render() {
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    const centerPoint = project(
      center.latitude,
      center.longitude,
      zoom,
    );
    const viewportLeft = centerPoint.x - width / 2;
    const viewportTop = centerPoint.y - height / 2;

    tiles.replaceChildren();
    overlay.replaceChildren();

    const firstTileX = Math.floor(viewportLeft / TILE_SIZE);
    const lastTileX = Math.floor(
      (viewportLeft + width) / TILE_SIZE,
    );
    const firstTileY = Math.max(
      0,
      Math.floor(viewportTop / TILE_SIZE),
    );
    const lastTileY = Math.min(
      2 ** zoom - 1,
      Math.floor((viewportTop + height) / TILE_SIZE),
    );

    for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
      for (
        let tileX = firstTileX;
        tileX <= lastTileX;
        tileX += 1
      ) {
        const normalizedX = normalizeTileX(tileX, zoom);
        tiles.append(
          createTile(
            `https://tile.openstreetmap.org/${zoom}/${normalizedX}/${tileY}.png`,
            tileX * TILE_SIZE - viewportLeft,
            tileY * TILE_SIZE - viewportTop,
          ),
        );
      }
    }

    const point = project(
      selection.latitude,
      selection.longitude,
      zoom,
    );
    const left = point.x - viewportLeft;
    const top = point.y - viewportTop;

    const radiusPixels = clamp(
      (selection.radiusKm * 1000) /
        Math.max(
          0.01,
          metersPerPixel(selection.latitude, zoom),
        ),
      3,
      4000,
    );

    const circle = document.createElement('div');
    circle.className = 'pricing-geofence-map__radius';
    circle.style.left = `${left}px`;
    circle.style.top = `${top}px`;
    circle.style.width = `${radiusPixels * 2}px`;
    circle.style.height = `${radiusPixels * 2}px`;

    const pin = document.createElement('div');
    pin.className = 'pricing-geofence-map__pin';
    pin.style.left = `${left}px`;
    pin.style.top = `${top}px`;
    pin.setAttribute('aria-hidden', 'true');

    overlay.append(circle, pin);
  }

  function setSelection(next, options = {}) {
    selection = {
      latitude: clamp(
        Number(next.latitude),
        -85.05112878,
        85.05112878,
      ),
      longitude: clamp(Number(next.longitude), -180, 180),
      radiusKm: clamp(Number(next.radiusKm), 0.05, 100),
    };
    if (options.recenter !== false) {
      center = {
        latitude: selection.latitude,
        longitude: selection.longitude,
      };
    }
    render();
  }

  function setRadiusKm(radiusKm) {
    selection.radiusKm = clamp(Number(radiusKm), 0.05, 100);
    render();
  }

  function notifySelection() {
    onChange({ ...selection });
  }

  function coordinateAt(clientX, clientY) {
    const rect = root.getBoundingClientRect();
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    const centerPoint = project(
      center.latitude,
      center.longitude,
      zoom,
    );
    return unproject(
      centerPoint.x - width / 2 + clientX - rect.left,
      centerPoint.y - height / 2 + clientY - rect.top,
      zoom,
    );
  }

  function isControlTarget(target) {
    return (
      target instanceof Element &&
      target.closest(
        '.pricing-geofence-map__controls, .pricing-geofence-map__attribution',
      ) != null
    );
  }

  function onPointerDown(event) {
    if (event.button !== 0 || isControlTarget(event.target)) return;
    root.setPointerCapture(event.pointerId);
    pointer = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      centerPoint: project(
        center.latitude,
        center.longitude,
        zoom,
      ),
      moved: false,
    };
  }

  function onPointerMove(event) {
    if (pointer?.pointerId !== event.pointerId) return;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      pointer.moved = true;
    }
    if (!pointer.moved) return;

    center = unproject(
      pointer.centerPoint.x - dx,
      pointer.centerPoint.y - dy,
      zoom,
    );
    render();
  }

  function onPointerUp(event) {
    if (pointer?.pointerId !== event.pointerId) return;
    const moved = pointer.moved;
    pointer = null;
    try {
      root.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer may already have been released by the browser.
    }

    if (moved) return;
    const point = coordinateAt(event.clientX, event.clientY);
    selection.latitude = point.latitude;
    selection.longitude = point.longitude;
    render();
    notifySelection();
  }

  function changeZoom(delta) {
    zoom = clamp(zoom + delta, 9, 18);
    render();
  }

  zoomIn.addEventListener('click', () => changeZoom(1));
  zoomOut.addEventListener('click', () => changeZoom(-1));
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', () => {
    pointer = null;
  });

  const resize = () => render();
  window.addEventListener('resize', resize);

  render();

  return {
    getSelection() {
      return { ...selection };
    },
    setSelection,
    setRadiusKm,
    render,
    destroy() {
      window.removeEventListener('resize', resize);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', onPointerUp);
      tiles.replaceChildren();
      overlay.replaceChildren();
    },
  };
}


export function createPricingCoverageMap(input) {
  const root = input.root;
  const tiles = input.tiles;
  const overlay = input.overlay;
  const zoomIn = input.zoomIn;
  const zoomOut = input.zoomOut;
  const onSelect =
    typeof input.onSelect === 'function' ? input.onSelect : () => {};

  let zoom = 11;
  let center = { ...DEFAULT_CENTER };
  let areas = [];
  let pointer = null;

  function validAreas(next) {
    return (Array.isArray(next) ? next : []).filter((area) => {
      const latitude = Number(area?.centerLatitude);
      const longitude = Number(area?.centerLongitude);
      const radiusKm = Number(area?.radiusKm);
      return (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Number.isFinite(radiusKm) &&
        radiusKm > 0
      );
    });
  }

  function fitCenter() {
    if (areas.length === 0) {
      center = { ...DEFAULT_CENTER };
      return;
    }
    const total = areas.reduce(
      (sum, area) => ({
        latitude: sum.latitude + Number(area.centerLatitude),
        longitude: sum.longitude + Number(area.centerLongitude),
      }),
      { latitude: 0, longitude: 0 },
    );
    center = {
      latitude: total.latitude / areas.length,
      longitude: total.longitude / areas.length,
    };
  }

  function render() {
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    const centerPoint = project(center.latitude, center.longitude, zoom);
    const viewportLeft = centerPoint.x - width / 2;
    const viewportTop = centerPoint.y - height / 2;

    tiles.replaceChildren();
    overlay.replaceChildren();

    const firstTileX = Math.floor(viewportLeft / TILE_SIZE);
    const lastTileX = Math.floor((viewportLeft + width) / TILE_SIZE);
    const firstTileY = Math.max(0, Math.floor(viewportTop / TILE_SIZE));
    const lastTileY = Math.min(
      2 ** zoom - 1,
      Math.floor((viewportTop + height) / TILE_SIZE),
    );

    for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
      for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
        const normalizedX = normalizeTileX(tileX, zoom);
        tiles.append(
          createTile(
            `https://tile.openstreetmap.org/${zoom}/${normalizedX}/${tileY}.png`,
            tileX * TILE_SIZE - viewportLeft,
            tileY * TILE_SIZE - viewportTop,
          ),
        );
      }
    }

    for (const area of areas) {
      const latitude = Number(area.centerLatitude);
      const longitude = Number(area.centerLongitude);
      const radiusKm = Number(area.radiusKm);
      const point = project(latitude, longitude, zoom);
      const left = point.x - viewportLeft;
      const top = point.y - viewportTop;
      const radiusPixels = clamp(
        (radiusKm * 1000) /
          Math.max(0.01, metersPerPixel(latitude, zoom)),
        3,
        4000,
      );

      const circle = document.createElement('button');
      circle.type = 'button';
      circle.className = 'pricing-coverage-map__radius';
      circle.style.left = `${left}px`;
      circle.style.top = `${top}px`;
      circle.style.width = `${radiusPixels * 2}px`;
      circle.style.height = `${radiusPixels * 2}px`;
      circle.title = `${area.label ?? area.localityId} · ${radiusKm.toLocaleString('pt-BR')} km`;
      circle.setAttribute(
        'aria-label',
        `Editar ${area.label ?? area.localityId}`,
      );
      circle.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelect(area);
      });

      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'pricing-coverage-map__pin';
      pin.style.left = `${left}px`;
      pin.style.top = `${top}px`;
      pin.title = area.label ?? area.localityId;
      pin.setAttribute(
        'aria-label',
        `Editar ${area.label ?? area.localityId}`,
      );
      pin.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelect(area);
      });

      overlay.append(circle, pin);
    }
  }

  function setAreas(next, options = {}) {
    areas = validAreas(next);
    if (options.recenter !== false) fitCenter();
    render();
  }

  function coordinateAt(clientX, clientY) {
    const rect = root.getBoundingClientRect();
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    const centerPoint = project(center.latitude, center.longitude, zoom);
    return unproject(
      centerPoint.x - width / 2 + clientX - rect.left,
      centerPoint.y - height / 2 + clientY - rect.top,
      zoom,
    );
  }

  function onPointerDown(event) {
    if (
      event.button !== 0 ||
      (event.target instanceof Element &&
        event.target.closest(
          '.pricing-geofence-map__controls, .pricing-geofence-map__attribution, .pricing-coverage-map__pin, .pricing-coverage-map__radius',
        ) != null)
    ) {
      return;
    }
    root.setPointerCapture(event.pointerId);
    pointer = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      centerPoint: project(center.latitude, center.longitude, zoom),
      moved: false,
    };
  }

  function onPointerMove(event) {
    if (pointer?.pointerId !== event.pointerId) return;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) pointer.moved = true;
    if (!pointer.moved) return;
    center = unproject(
      pointer.centerPoint.x - dx,
      pointer.centerPoint.y - dy,
      zoom,
    );
    render();
  }

  function onPointerUp(event) {
    if (pointer?.pointerId !== event.pointerId) return;
    pointer = null;
    try {
      root.releasePointerCapture(event.pointerId);
    } catch {
      // Browser may have already released this pointer.
    }
  }

  function changeZoom(delta) {
    zoom = clamp(zoom + delta, 9, 18);
    render();
  }

  zoomIn.addEventListener('click', () => changeZoom(1));
  zoomOut.addEventListener('click', () => changeZoom(-1));
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', () => {
    pointer = null;
  });

  const resize = () => render();
  window.addEventListener('resize', resize);

  return {
    setAreas,
    render,
    destroy() {
      window.removeEventListener('resize', resize);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', onPointerUp);
      tiles.replaceChildren();
      overlay.replaceChildren();
    },
  };
}
