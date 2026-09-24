const TILE_SIZE = 256;
const DEFAULT_CENTER = {
  latitude: -2.846,
  longitude: -40.456,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function worldSize(zoom) {
  return TILE_SIZE * 2 ** zoom;
}

function project(latitude, longitude, zoom) {
  const size = worldSize(zoom);
  const lat = clamp(Number(latitude), -85.05112878, 85.05112878);
  const lon = Number(longitude);
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * size,
    y:
      (0.5 -
        Math.log((1 + sin) / (1 - sin)) /
          (4 * Math.PI)) *
      size,
  };
}

function validFleetItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => {
    const latitude = Number(item?.location?.latitude);
    const longitude = Number(item?.location?.longitude);
    return (
      Number.isFinite(latitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      Number.isFinite(longitude) &&
      longitude >= -180 &&
      longitude <= 180
    );
  });
}

function centerFor(items) {
  if (items.length === 0) return DEFAULT_CENTER;
  const total = items.reduce(
    (sum, item) => ({
      latitude: sum.latitude + Number(item.location.latitude),
      longitude: sum.longitude + Number(item.location.longitude),
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: total.latitude / items.length,
    longitude: total.longitude / items.length,
  };
}

function markerCode(item) {
  const category = item?.currentServiceCategory ??
    item?.categories?.[0] ??
    'car';
  if (category === 'moto') return 'M';
  if (category === 'delivery') return 'E';
  if (category === 'buggy') return 'B';
  if (category === 'comfort_black') return 'C+';
  return 'C';
}

function markerDescription(item) {
  const activity =
    item?.availability === 'on_ride'
      ? 'em corrida'
      : item?.availability === 'reserved'
        ? 'reservado'
        : item?.availability === 'busy'
          ? 'ocupado'
          : 'livre';
  const gps =
    item?.location?.status === 'stale'
      ? 'GPS atrasado'
      : 'GPS atualizado';
  return `${item?.driverName ?? item?.driverId ?? 'Motorista'} · ${activity} · ${gps}`;
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
  image.referrerPolicy = 'no-referrer';
  image.className = 'fleet-map__tile';
  image.style.left = `${left}px`;
  image.style.top = `${top}px`;
  return image;
}

export function createFleetMap(input) {
  const root = input.root;
  const tiles = input.tiles;
  const markers = input.markers;
  const zoomIn = input.zoomIn;
  const zoomOut = input.zoomOut;
  let zoom = 12;
  let fleet = [];
  let center = DEFAULT_CENTER;

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
    markers.replaceChildren();

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
        const left = tileX * TILE_SIZE - viewportLeft;
        const top = tileY * TILE_SIZE - viewportTop;
        tiles.append(
          createTile(
            `https://tile.openstreetmap.org/${zoom}/${normalizedX}/${tileY}.png`,
            left,
            top,
          ),
        );
      }
    }

    for (const item of fleet) {
      const point = project(
        item.location.latitude,
        item.location.longitude,
        zoom,
      );
      const left = point.x - viewportLeft;
      const top = point.y - viewportTop;

      if (
        left < -40 ||
        top < -40 ||
        left > width + 40 ||
        top > height + 40
      ) {
        continue;
      }

      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'fleet-marker';
      marker.dataset.availability = item.availability ?? 'free';
      marker.dataset.gps = item.location.status ?? 'fresh';
      marker.dataset.category =
        item.currentServiceCategory ??
        item.categories?.[0] ??
        'car';
      marker.style.left = `${left}px`;
      marker.style.top = `${top}px`;
      marker.title = markerDescription(item);
      marker.setAttribute(
        'aria-label',
        markerDescription(item),
      );

      const code = document.createElement('span');
      code.className = 'fleet-marker__code';
      code.textContent = markerCode(item);

      const pulse = document.createElement('span');
      pulse.className = 'fleet-marker__pulse';
      pulse.setAttribute('aria-hidden', 'true');

      marker.append(pulse, code);
      markers.append(marker);
    }
  }

  function update(items, options = {}) {
    fleet = validFleetItems(items);
    if (options.recenter !== false) {
      center = centerFor(fleet);
    }
    render();
  }

  function changeZoom(delta) {
    zoom = clamp(zoom + delta, 10, 17);
    render();
  }

  zoomIn.addEventListener('click', () => changeZoom(1));
  zoomOut.addEventListener('click', () => changeZoom(-1));

  const resize = () => render();
  window.addEventListener('resize', resize);

  return {
    update,
    render,
    destroy() {
      window.removeEventListener('resize', resize);
      tiles.replaceChildren();
      markers.replaceChildren();
    },
  };
}
