const reviewKey = 'WEB_KEY_NOT_CONFIGURED_FOR_CI';
export function validateMapsWebKey(value, { allowReviewPlaceholder = false } = {}) {
  if (typeof value !== 'string') throw new Error('Chave Maps Web ausente/inválida.');
  const key = value.trim();
  if (allowReviewPlaceholder && key === reviewKey) return key;
  if (!/^AIza[A-Za-z0-9_-]{35}$/.test(key)) {
    throw new Error('Chave Maps Web ausente/inválida; use chave pública de navegador restrita.');
  }
  return key;
}
export function prepareMapsWebIndex(index, rawKey, { allowReviewPlaceholder = false } = {}) {
  const key = validateMapsWebKey(rawKey?.trim() || (allowReviewPlaceholder ? reviewKey : ''),
    { allowReviewPlaceholder });
  const marker = '__RAMO_GOOGLE_MAPS_WEB_KEY__';
  if (index.split(marker).length !== 2 ||
      !index.includes('https://maps.googleapis.com/maps/api/js?key=' + marker + '"')) {
    throw new Error('Entrypoint Maps alterado ou já preparado; use fonte original do build.');
  }
  return index.replace(marker, key);
}
