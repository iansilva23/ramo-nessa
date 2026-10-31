export async function reverseCoordinate(input: {
  latitude: number; longitude: number; apiKey?: string | undefined; fetcher?: typeof fetch;
}): Promise<{ name: string; address: string } | null> {
  if (!input.apiKey?.trim()) return null;
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${input.latitude},${input.longitude}`);
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('key', input.apiKey);
  try {
    const response = await (input.fetcher ?? fetch)(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const data = await response.json() as { status?: string; results?: { formatted_address?: string;
      address_components?: { long_name?: string; types?: string[] }[] }[] };
    if (data.status !== 'OK') return null;
    const first = data.results?.[0];
    const components = first?.address_components ?? [];
    const text = (type: string) => components.find(c => c.types?.includes(type))?.long_name?.trim();
    const street = text('route');
    // A neighboring building's number is deliberately excluded.
    const address = [street, text('sublocality_level_1') || text('neighborhood'),
      text('administrative_area_level_2') || text('locality'),
      text('administrative_area_level_1')].filter(Boolean).join(', ');
    if (!address || !street) return null;
    return { name: street.slice(0, 120), address: address.slice(0, 240) };
  } catch { return null; }
}
