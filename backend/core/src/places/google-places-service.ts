type FetchLike = typeof fetch;

export interface GooglePlaceResult {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface GooglePlacePrediction {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

export interface GooglePlaceDetailsResult {
  id: string;
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

interface GoogleAutocompletePayload {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: {
        text?: string;
      };
      structuredFormat?: {
        mainText?: {
          text?: string;
        };
        secondaryText?: {
          text?: string;
        };
      };
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface GooglePlaceDetailsPayload {
  id?: string;
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
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
      | 'INVALID_SESSION'
      | 'INVALID_PLACE_ID'
      | 'OUTSIDE_LOCAL_AREA'
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

function validateSessionToken(raw: string): string {
  const token = raw.trim();
  if (
    token.length < 1 ||
    token.length > 36 ||
    !/^[A-Za-z0-9_-]+$/.test(token)
  ) {
    throw new GooglePlacesError(
      'INVALID_SESSION',
      'Sessão de busca de lugares inválida.',
    );
  }
  return token;
}

function validatePlaceId(raw: string): string {
  const placeId = raw.trim();
  if (
    placeId.length < 3 ||
    placeId.length > 256 ||
    /[\u0000-\u001F\u007F]/.test(placeId)
  ) {
    throw new GooglePlacesError(
      'INVALID_PLACE_ID',
      'Identificador de lugar inválido.',
    );
  }
  return placeId;
}

function providerMessage(
  payload: {
    error?: { message?: string };
  },
): string {
  return payload.error?.message?.trim() ?? '';
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

  async autocomplete(input: {
    query: string;
    sessionToken: string;
    localOnly: boolean;
  }): Promise<GooglePlacePrediction[]> {
    const query = input.query.trim();
    if (query.length < 3 || query.length > 160) {
      throw new GooglePlacesError(
        'INVALID_QUERY',
        'A busca precisa ter entre 3 e 160 caracteres.',
      );
    }
    const sessionToken = validateSessionToken(input.sessionToken);

    const url = new URL('./places:autocomplete', this.baseUrl);
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
            'suggestions.placePrediction.placeId',
            'suggestions.placePrediction.text.text',
            'suggestions.placePrediction.structuredFormat.mainText.text',
            'suggestions.placePrediction.structuredFormat.secondaryText.text',
          ].join(','),
        },
        body: JSON.stringify({
          input: query,
          sessionToken,
          languageCode: 'pt-BR',
          regionCode: 'BR',
          includedRegionCodes: ['br'],
          ...(input.localOnly
            ? {
                locationRestriction: {
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
      let message = '';
      try {
        message = providerMessage(
          (await response.json()) as GoogleAutocompletePayload,
        );
      } catch {
        // Mantém mensagem segura abaixo.
      }
      throw new GooglePlacesError(
        'PROVIDER_UNAVAILABLE',
        message ||
          `Google Places respondeu HTTP ${response.status}.`,
      );
    }

    let payload: GoogleAutocompletePayload;
    try {
      payload = (await response.json()) as GoogleAutocompletePayload;
    } catch {
      throw new GooglePlacesError(
        'INVALID_PROVIDER_RESPONSE',
        'Google Places retornou sugestões inválidas.',
      );
    }

    if (
      payload.suggestions != null &&
      !Array.isArray(payload.suggestions)
    ) {
      throw new GooglePlacesError(
        'INVALID_PROVIDER_RESPONSE',
        'Google Places retornou sugestões inválidas.',
      );
    }

    return (payload.suggestions ?? [])
      .map((suggestion): GooglePlacePrediction | null => {
        const prediction = suggestion.placePrediction;
        const placeId = prediction?.placeId?.trim() ?? '';
        const mainText =
          prediction?.structuredFormat?.mainText?.text?.trim() ??
          prediction?.text?.text?.split(',')[0]?.trim() ??
          '';
        const secondaryText =
          prediction?.structuredFormat?.secondaryText?.text?.trim() ??
          '';

        if (!placeId || !mainText) return null;

        return {
          placeId,
          mainText,
          secondaryText,
        };
      })
      .filter(
        (prediction): prediction is GooglePlacePrediction =>
          prediction != null,
      );
  }

  async placeDetails(input: {
    placeId: string;
    sessionToken: string;
    localOnly: boolean;
  }): Promise<GooglePlaceDetailsResult> {
    const placeId = validatePlaceId(input.placeId);
    const sessionToken = validateSessionToken(input.sessionToken);
    const url = new URL(
      `./places/${encodeURIComponent(placeId)}`,
      this.baseUrl,
    );
    url.searchParams.set('sessionToken', sessionToken);
    url.searchParams.set('languageCode', 'pt-BR');
    url.searchParams.set('regionCode', 'BR');

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: 'application/json',
          'x-goog-api-key': this.apiKey,
          'x-goog-fieldmask': 'id,formattedAddress,location',
        },
      });
    } catch {
      throw new GooglePlacesError(
        'PROVIDER_UNAVAILABLE',
        'O Google Places não respondeu a tempo.',
      );
    }

    if (!response.ok) {
      let message = '';
      try {
        message = providerMessage(
          (await response.json()) as GooglePlaceDetailsPayload,
        );
      } catch {
        // Mantém mensagem segura abaixo.
      }
      throw new GooglePlacesError(
        'PROVIDER_UNAVAILABLE',
        message ||
          `Google Places respondeu HTTP ${response.status}.`,
      );
    }

    let payload: GooglePlaceDetailsPayload;
    try {
      payload = (await response.json()) as GooglePlaceDetailsPayload;
    } catch {
      throw new GooglePlacesError(
        'INVALID_PROVIDER_RESPONSE',
        'Google Places retornou um lugar inválido.',
      );
    }

    const id = payload.id?.trim() ?? placeId;
    const address = payload.formattedAddress?.trim() ?? '';
    const latitude = payload.location?.latitude;
    const longitude = payload.location?.longitude;
    if (
      !id ||
      !address ||
      typeof latitude !== 'number' ||
      !Number.isFinite(latitude) ||
      typeof longitude !== 'number' ||
      !Number.isFinite(longitude)
    ) {
      throw new GooglePlacesError(
        'INVALID_PROVIDER_RESPONSE',
        'Google Places retornou um lugar inválido.',
      );
    }

    if (input.localOnly && !insideLocalBounds(latitude, longitude)) {
      throw new GooglePlacesError(
        'OUTSIDE_LOCAL_AREA',
        'Esse lugar está fora da área local de busca.',
      );
    }

    return {
      id,
      address,
      latitude,
      longitude,
    };
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
      let message = '';
      try {
        message = providerMessage(
          (await response.json()) as GooglePlacesPayload,
        );
      } catch {
        // Mantém mensagem segura abaixo.
      }
      throw new GooglePlacesError(
        'PROVIDER_UNAVAILABLE',
        message ||
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
