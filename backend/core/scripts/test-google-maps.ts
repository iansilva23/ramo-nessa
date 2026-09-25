import { createServer } from 'node:http';

const port = Number(process.env.GOOGLE_MAPS_MOCK_PORT ?? '8091');
const apiKey =
  process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() ??
  'test-google-server-key';

function json(
  response: import('node:http').ServerResponse,
  status: number,
  body: unknown,
) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function readJson(
  request: import('node:http').IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
    );
  }
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(
    Buffer.concat(chunks).toString('utf8'),
  ) as unknown;
  return parsed != null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function pointFrom(
  raw: unknown,
): { latitude: number; longitude: number } | null {
  if (
    raw == null ||
    typeof raw !== 'object' ||
    Array.isArray(raw)
  ) {
    return null;
  }
  const location = (raw as {
    location?: {
      latLng?: {
        latitude?: unknown;
        longitude?: unknown;
      };
    };
  }).location?.latLng;
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  return typeof latitude === 'number' &&
      Number.isFinite(latitude) &&
      typeof longitude === 'number' &&
      Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function encodePolyline(
  points: Array<{ latitude: number; longitude: number }>,
): string {
  let previousLatitude = 0;
  let previousLongitude = 0;
  let output = '';

  const encodeDelta = (delta: number) => {
    let value = delta < 0 ? ~(delta << 1) : delta << 1;
    let encoded = '';
    while (value >= 0x20) {
      encoded += String.fromCharCode(
        (0x20 | (value & 0x1f)) + 63,
      );
      value >>= 5;
    }
    return encoded + String.fromCharCode(value + 63);
  };

  for (const point of points) {
    const latitude = Math.round(point.latitude * 1e5);
    const longitude = Math.round(point.longitude * 1e5);
    output += encodeDelta(latitude - previousLatitude);
    output += encodeDelta(longitude - previousLongitude);
    previousLatitude = latitude;
    previousLongitude = longitude;
  }
  return output;
}

function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radians = (degrees: number) =>
    degrees * Math.PI / 180;
  const earthRadius = 6_371_000;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

const server = createServer(async (request, response) => {
  const url = new URL(
    request.url ?? '/',
    'http://google-maps-mock.local',
  );

  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, { ok: true });
    return;
  }

  if (request.headers['x-goog-api-key'] !== apiKey) {
    json(response, 403, {
      error: {
        code: 403,
        status: 'PERMISSION_DENIED',
        message: 'invalid mock Google API key',
      },
    });
    return;
  }

  if (
    request.method === 'POST' &&
    url.pathname === '/directions/v2:computeRoutes'
  ) {
    const body = await readJson(request);
    const origin = pointFrom(body.origin);
    const destination = pointFrom(body.destination);

    if (origin == null || destination == null) {
      json(response, 400, {
        error: {
          code: 400,
          status: 'INVALID_ARGUMENT',
          message: 'origin and destination are required',
        },
      });
      return;
    }

    const direct = haversineMeters(origin, destination);
    const distanceMeters = Math.max(
      1,
      Math.round(direct * 1.18),
    );
    const durationSeconds = Math.max(
      60,
      Math.round(distanceMeters / 8.33),
    );
    const mid = {
      latitude:
        origin.latitude +
        (destination.latitude - origin.latitude) * 0.52,
      longitude:
        origin.longitude +
        (destination.longitude - origin.longitude) * 0.48,
    };

    json(response, 200, {
      routes: [
        {
          distanceMeters,
          duration: `${durationSeconds}s`,
          polyline: {
            encodedPolyline: encodePolyline([
              origin,
              mid,
              destination,
            ]),
          },
          legs: [
            {
              steps: [
                {
                  distanceMeters,
                  staticDuration: `${durationSeconds}s`,
                  navigationInstruction: {
                    maneuver: 'STRAIGHT',
                    instructions:
                      'Siga pela rota indicada até o destino.',
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    return;
  }

  if (
    request.method === 'POST' &&
    url.pathname === '/v1/places:searchText'
  ) {
    const body = await readJson(request);
    const query =
      typeof body.textQuery === 'string'
        ? body.textQuery.trim()
        : '';

    if (query.length < 3) {
      json(response, 400, {
        error: {
          code: 400,
          status: 'INVALID_ARGUMENT',
          message: 'textQuery is required',
        },
      });
      return;
    }

    const normalized = query.toLowerCase();
    const place = normalized.includes('preá') ||
        normalized.includes('prea')
      ? {
          id: 'mock-prea',
          displayName: {
            text: 'Preá',
            languageCode: 'pt-BR',
          },
          formattedAddress: 'Preá, Cruz - CE, Brasil',
          location: {
            latitude: -2.8157,
            longitude: -40.4126,
          },
        }
      : {
          id: 'mock-jericoacoara',
          displayName: {
            text: 'Jericoacoara',
            languageCode: 'pt-BR',
          },
          formattedAddress:
            'Jericoacoara, Jijoca de Jericoacoara - CE, Brasil',
          location: {
            latitude: -2.7956,
            longitude: -40.5142,
          },
        };

    json(response, 200, { places: [place] });
    return;
  }

  json(response, 404, {
    error: {
      code: 404,
      status: 'NOT_FOUND',
      message: 'mock endpoint not found',
    },
  });
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(
    `Google Maps mock server on ${port}\n`,
  );
});
