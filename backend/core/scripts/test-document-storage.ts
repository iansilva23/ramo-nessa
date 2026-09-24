import { createServer } from 'node:http';

const port = Number(process.env.DOCUMENT_STORAGE_PORT ?? '8090');
const token = process.env.DOCUMENT_STORAGE_AUTH_TOKEN?.trim() ?? '';
const maxBytes = 20 * 1024 * 1024;

if (token.length < 24) {
  throw new Error(
    'DOCUMENT_STORAGE_AUTH_TOKEN de teste deve ter pelo menos 24 caracteres.',
  );
}

const cnh = Buffer.from(
  '%PDF-1.4\n% Ramo Nessa CNH smoke fixture\n',
  'utf8',
);
const crlv = Buffer.from(
  '%PDF-1.4\n% Ramo Nessa CRLV smoke fixture\n',
  'utf8',
);

const uploaded = new Map<
  string,
  { bytes: Buffer; contentType: string }
>();

const server = createServer(async (request, response) => {
  const authorization = request.headers.authorization ?? '';
  if (authorization !== `Bearer ${token}`) {
    response.writeHead(401, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end('unauthorized');
    return;
  }

  const url = new URL(request.url ?? '/', 'http://storage.local');

  if (request.method === 'PUT') {
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += buffer.length;
      if (received > maxBytes) {
        response.writeHead(413);
        response.end();
        return;
      }
      chunks.push(buffer);
    }

    uploaded.set(url.pathname, {
      bytes: Buffer.concat(chunks),
      contentType:
        request.headers['content-type']
          ?.split(';')[0]
          ?.trim()
          .toLowerCase() || 'application/octet-stream',
    });
    response.writeHead(204, {
      'cache-control': 'no-store',
    });
    response.end();
    return;
  }

  if (request.method !== 'GET') {
    response.writeHead(405, { allow: 'GET, PUT' });
    response.end();
    return;
  }

  const dynamic = uploaded.get(url.pathname);
  if (dynamic != null) {
    response.writeHead(200, {
      'content-type': dynamic.contentType,
      'content-length': String(dynamic.bytes.length),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(dynamic.bytes);
    return;
  }

  const fixture = url.pathname.endsWith('/cnh-smoke.pdf')
    ? cnh
    : url.pathname.endsWith('/crlv-smoke.pdf')
      ? crlv
      : null;

  if (fixture == null) {
    response.writeHead(404, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end('not found');
    return;
  }

  response.writeHead(200, {
    'content-type': 'application/pdf',
    'content-length': String(fixture.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(fixture);
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(
    `private document storage test server on ${port}\n`,
  );
});
