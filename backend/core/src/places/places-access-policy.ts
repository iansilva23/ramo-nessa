export function placesLocalityId(value: string): string {
  const label = value.split(',')[0]?.trim() ?? '';
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isApprovedExternalPlacesQuery(input: {
  query: string;
  externalLocalities: readonly string[];
}): boolean {
  const localityId = placesLocalityId(input.query);
  return localityId.length > 0 &&
    input.externalLocalities.includes(localityId);
}
