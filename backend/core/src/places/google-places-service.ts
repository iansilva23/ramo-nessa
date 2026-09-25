type FetchLike = typeof fetch;

export interface GooglePlaceResult {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface GooglePlacesPayload {
  places?: Array<{
    id?: string;
    displayName?: {
      text?: string;
      languageCode?: string;
    };
    formattedAddress?: string;
    location?: {
      latitude?: number;
      longitude?: number;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export class GooglePlacesError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_QUERY'
      | 'PROVIDER_UNAVAILABLE'
      | 'INVALID_PROVIDER_RESPONSE',
    message: string,
  ) {
    super(message);
    this.name = 'GooglePlacesError';
  }
}

const LOCAL_BOUNDS = {
  minLatitude: -2.98,
  maxLatitude: -2.73,
  minLongitude: -40.61,
  maxLongitude: -40.34,
};

function insideLocalBounds(latitude: number, longitude: number): boolean {
  return latitude >= LOCAL_BOUNDS.minLatitude &&
    latitude <= LOCAL_BOUNDS.maxLatitude &&
    longitude >= LOCAL_BOUNDS.minLongitude &&
    longitude <= LOCAL_BOUNDS.maxLongitude;
}

function normalizedBaseUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('GOOGLE_PLACES_BASE_URL precisa ser uma URL válida.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('GOOGLE_PLACES_BASE_URL deve usar http ou https.');
  }
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
  return parsed;
}

export class GooglePlacesService {
  private readonly baseUrl: URL;

  constructor(
    private readonly apiKey: string,
    baseUrl = 'https://places.googleapis.com/v1/',
    private readonly timeoutMs = 5_000,
    private readonly fetcher: FetchLike = fetch,
  ) {
    if (!apiKey.trim()) {
      throw new Error('GOOGLE_MAPS_SERVER_API_KEY é obrigatória.');
    }
    this.baseUrl = normalizedBaseUrl(baseUrl);
  }

  async searchText(input: {
    query: string;
    localOnly: boolean;
  }): Promise<GooglePlaceResult[]> {
    const query = input.query.trim();
    if (query.length < 3 || query.length > 160) {
      throw new GooglePlacesError(
        'INVALID_QUERY',
        'A busca precisa ter entre 3 e 160 caracteres.',
      );
    }

    const url = new URL('./places:searchText', this.baseUrl);
    let response: Response;

    try {
      response = await this.fetcher(url, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey,
          'x-goog-fieldmask': [
            'places.id',
            'places.displayName',
            'places.formattedAddress',
            'places.location',
          ].join(','),
        },
        body: JSON.stringify({
          textQuery: query,
          pageSize: 6,
          languageCode: 'pt-BR',
          regionCode: 'BR',
          ...(input.localOnly
            ? {
                locationBias: {
                  rectangle: {
                    low: {
                      latitude: LOCAL_BOUNDS.minLatitude,
                      longitude: LOCAL_BOUNDS.minLongitude,
                    },
                    high: {
                      latitude: LOCAL_BOUNDS.maxLatitude,
                      longitude: LOCAL_BOUNDS.maxLongitude,
                    },
                  },
                },
              }
            : {}),
        }),
      });
    } catch {
      throw new GooglePlacesError(
        'PROVIDER_UNAVAILABLE',
        'O Google Places não respondeu a tempo.',
      );
    }

    if (!response.ok) {
      let providerMessage = '';
      try {
        const body = (await response.json()) as GooglePlacesPayload;
        providerMessage = body.error?.message?.trim() ?? '';
      } catch {
        // Mantém mensagem segura abaixo.
      }
      throw new GooglePlacesError(
        'PROVIDER_UNAVAILABLE',
        providerMessage ||
          `Google Places respondeu HTTP ${response.status}.`,
      );
    }

    let payload: GooglePlacesPayload;
    try {
      payload = (await response.json()) as GooglePlacesPayload;
    } catch {
      throw new GooglePlacesError(
        'INVALID_PROVIDER_RESPONSE',
        'Google Places retornou uma resposta inválida.',
      );
    }

    if (payload.places != null && !Array.isArray(payload.places)) {
      throw new GooglePlacesError(
        'INVALID_PROVIDER_RESPONSE',
        'Google Places retornou uma lista inválida.',
      );
    }

    return (payload.places ?? [])
      .map((place): GooglePlaceResult | null => {
        const id = place.id?.trim() ?? '';
        const name = place.displayName?.text?.trim() ?? '';
        const address = place.formattedAddress?.trim() ?? '';
        const latitude = place.location?.latitude;
        const longitude = place.location?.longitude;

        if (
          !id ||
          !name ||
          !address ||
          typeof latitude !== 'number' ||
          !Number.isFinite(latitude) ||
          typeof longitude !== 'number' ||
          !Number.isFinite(longitude)
        ) {
          return null;
        }

        if (
          input.localOnly &&
          !insideLocalBounds(latitude, longitude)
        ) {
          return null;
        }

        return {
          id,
          name,
          address,
          latitude,
          longitude,
        };
      })
      .filter((place): place is GooglePlaceResult => place != null);
  }
}

export function createGooglePlacesServiceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GooglePlacesService | null {
  const apiKey = env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
  if (!apiKey) return null;

  const timeoutRaw = Number.parseInt(
    env.ROUTING_TIMEOUT_MS?.trim() ?? '',
    10,
  );
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 500
      ? timeoutRaw
      : 5_000;

  return new GooglePlacesService(
    apiKey,
    env.GOOGLE_PLACES_BASE_URL?.trim() ||
      'https://places.googleapis.com/v1/',
    timeoutMs,
  );
}
