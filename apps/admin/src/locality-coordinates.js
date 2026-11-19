export function parseLocalityCoordinates(latitude, longitude) {
  function parse(value) {
    const text = String(value ?? '').trim().replace(',', '.');
    return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN;
  }
  const lat = parse(latitude), lon = parse(longitude);
  if (!Number.isFinite(lat) || Math.abs(lat) > 85.05112878 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
    throw new Error('Informe latitude entre -85,05112878 e 85,05112878 e longitude entre -180 e 180.');
  }
  return { latitude: lat, longitude: lon };
}
