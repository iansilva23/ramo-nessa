export function placesLocalityId(value: string): string {
  const firstSegment = value.split(',')[0]?.trim() ?? '';
  const label = firstSegment.split(/\s+-\s+/)[0]?.trim() ?? '';
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

export function isApprovedExternalPlaceDetails(input: {
  localityId: string;
  formattedAddress: string;
  addressComponentNames?: readonly string[];
  externalLocalities: readonly string[];
}): boolean {
  const localityId = input.localityId.trim();
  if (
    localityId.length === 0 ||
    !input.externalLocalities.includes(localityId)
  ) {
    return false;
  }

  if (placesLocalityId(input.formattedAddress) === localityId) {
    return true;
  }

  return (input.addressComponentNames ?? []).some(
    (name) => placesLocalityId(name) === localityId,
  );
}
