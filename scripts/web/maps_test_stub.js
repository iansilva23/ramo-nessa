// Test fixture only. Supports initial map mounting without SDK or provider calls.
// It does not validate map tiles, routes, GPS or Google Maps rendering.
(() => {
  const listeners = new WeakMap();
  globalThis.ramoTestMapOptions = [];
  const event = {
    addListener(target, name, callback) {
      let list = listeners.get(target); if (!list) listeners.set(target, list = new Map());
      if (!list.has(name)) list.set(name, new Set()); list.get(name).add(callback);
      const handle = { remove: () => list.get(name)?.delete(callback) };
      if (['idle', 'tilesloaded', 'projection_changed'].includes(name)) setTimeout(() => {
        if (list.get(name)?.has(callback)) callback();
      }, 30);
      return handle;
    },
    removeListener(handle) { handle?.remove(); },
    clearInstanceListeners(target) { listeners.delete(target); },
    trigger(target, name, value) { for (const callback of listeners.get(target)?.get(name) ?? []) callback(value); },
  };
  class LatLng {
    constructor(lat, lng) { this.latitude = lat; this.longitude = lng; }
    lat() { return this.latitude; } lng() { return this.longitude; }
    toJSON() { return { lat: this.lat(), lng: this.lng() }; }
    equals(other) { return other?.lat() === this.lat() && other?.lng() === this.lng(); }
  }
  class LatLngBounds {
    constructor(sw = new LatLng(-3, -41), ne = new LatLng(-2, -40)) { this.sw = sw; this.ne = ne; }
    getSouthWest() { return this.sw; } getNorthEast() { return this.ne; }
    getCenter() { return new LatLng((this.sw.lat() + this.ne.lat()) / 2, (this.sw.lng() + this.ne.lng()) / 2); }
    extend() { return this; } contains() { return true; } isEmpty() { return false; }
  }
  class Point { constructor(x, y) { this.x = x; this.y = y; } }
  class Size { constructor(width, height) { this.width = width; this.height = height; } }
  class Overlay {
    constructor(options = {}) { this.options = options; this.map = options.map; }
    setOptions(options) { Object.assign(this.options, options); }
    setMap(map) { this.map = map; }
    set(name, value) { this.options[name] = value; }
    addListener(name, callback) { return event.addListener(this, name, callback); }
    open() {} close() {}
  }
  class TestMap extends Overlay {
    constructor(element, options = {}) {
      super(options); this.element = element;
      globalThis.ramoTestMapOptions.push({ gestureHandling: options.gestureHandling });
      element.style.backgroundColor = '#30343b';
      element.setAttribute('aria-label', 'Mapa simulado para teste');
    }
    getCenter() { return this.options.center ?? new LatLng(-2.8, -40.5); }
    getZoom() { return this.options.zoom ?? 15; }
    getHeading() { return this.options.heading ?? 0; }
    getTilt() { return this.options.tilt ?? 0; }
    getBounds() { return new LatLngBounds(); }
    getDiv() { return this.element; }
    setCenter(center) { this.options.center = center; }
    panTo(center) { this.setCenter(center); }
    setZoom(zoom) { this.options.zoom = zoom; }
    fitBounds(bounds) { this.options.center = bounds.getCenter(); }
    panBy() {}
    getProjection() { return { fromLatLngToPoint: p => new Point(p.lng(), p.lat()), fromPointToLatLng: p => new LatLng(p.y, p.x) }; }
  }
  globalThis.google = { maps: {
    Map: TestMap, LatLng, LatLngBounds, Point, Size, event,
    MapTypeId: { ROADMAP: 'roadmap', HYBRID: 'hybrid', SATELLITE: 'satellite', TERRAIN: 'terrain' },
    Marker: Overlay, Polyline: Overlay, Polygon: Overlay, Circle: Overlay,
    GroundOverlay: Overlay, InfoWindow: Overlay,
    marker: { AdvancedMarkerElement: Overlay }, visualization: { HeatmapLayer: Overlay },
  } };
})();

