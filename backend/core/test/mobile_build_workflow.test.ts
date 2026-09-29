import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function workflow(name: string): Promise<string> {
  return readFile(
    new URL(`../../../.github/workflows/${name}`, import.meta.url),
    'utf8',
  );
}

test('audit final mobile exige Firebase e chaves Maps dedicadas', async () => {
  const yaml = await workflow('mobile-build-audit.yml');

  for (const step of [
    'Validate Passenger Android Firebase push config',
    'Validate Driver Android Firebase push config',
    'Validate Passenger iOS Firebase push config',
    'Validate Driver iOS Firebase push config',
  ]) {
    assert.match(yaml, new RegExp(step));
  }

  assert.equal(
    (yaml.match(/--dart-define=RAMO_FIREBASE_API_KEY=/g) ?? []).length,
    4,
  );
  assert.equal(
    (yaml.match(/--dart-define=RAMO_FIREBASE_APP_ID=/g) ?? []).length,
    4,
  );
  assert.equal(
    (yaml.match(/--dart-define=RAMO_FIREBASE_MESSAGING_SENDER_ID=/g) ?? [])
      .length,
    4,
  );
  assert.equal(
    (yaml.match(/--dart-define=RAMO_FIREBASE_PROJECT_ID=/g) ?? []).length,
    4,
  );
  assert.equal(
    (yaml.match(/Validate production Core URL/g) ?? []).length,
    4,
  );
  assert.equal(
    (yaml.match(/RAMO_CORE_BASE_URL: \$\{\{ secrets\.RAMO_CORE_BASE_URL \}\}/g) ?? [])
      .length,
    8,
  );
  assert.equal(
    (yaml.match(/--dart-define=RAMO_CORE_BASE_URL=\$RAMO_CORE_BASE_URL/g) ?? [])
      .length,
    4,
  );
  assert.match(
    yaml,
    /RAMO_CORE_BASE_URL com a URL HTTPS pública do Core antes do release/,
  );

  for (const secretName of [
    'RAMO_GOOGLE_MAPS_ANDROID_PASSENGER_API_KEY',
    'RAMO_GOOGLE_MAPS_ANDROID_DRIVER_API_KEY',
    'RAMO_GOOGLE_MAPS_IOS_PASSENGER_API_KEY',
    'RAMO_GOOGLE_MAPS_IOS_DRIVER_API_KEY',
  ]) {
    assert.equal(yaml.includes('secrets.' + secretName), true);
  }

  assert.equal(
    yaml.includes('secrets.RAMO_GOOGLE_MAPS_ANDROID_API_KEY }}'),
    false,
  );
  assert.equal(
    yaml.includes('secrets.RAMO_GOOGLE_MAPS_IOS_API_KEY }}'),
    false,
  );
  assert.equal(
    (yaml.match(/tooling\/validate-google-maps-key\.mjs/g) ?? []).length,
    4,
  );

test('previews e audit iOS injetam Firebase quando disponível', async () => {
  const [preview, iosAudit] = await Promise.all([
    workflow('preview-build.yml'),
    workflow('ios-payment-audit.yml'),
  ]);

  assert.match(preview, /Check Passenger Firebase push config/);
  assert.match(preview, /Check Driver Firebase push config/);
  assert.match(preview, /Check Passenger connected Preview Core/);
  assert.match(preview, /Check Driver connected Preview Core/);
  assert.equal(
    (preview.match(/--dart-define=RAMO_FIREBASE_API_KEY=/g) ?? []).length,
    2,
  );
  assert.match(
    preview,
    /RAMO_CORE_BASE_URL: \$\{\{ secrets\.RAMO_PREVIEW_CORE_BASE_URL \}\}/,
  );
  assert.match(
    preview,
    /--dart-define=RAMO_CORE_BASE_URL=\$RAMO_CORE_BASE_URL/,
  );
  assert.equal(
    (preview.match(/--dart-define=RAMO_CORE_BASE_URL=\$RAMO_CORE_BASE_URL/g) ?? [])
      .length,
    2,
  );

  assert.match(iosAudit, /Check Passenger Firebase push config/);
  assert.match(
    iosAudit,
    /RAMO_GOOGLE_MAPS_IOS_PASSENGER_API_KEY \|\| secrets\.RAMO_GOOGLE_MAPS_IOS_API_KEY/,
  );
  assert.match(
    iosAudit,
    /--dart-define=RAMO_FIREBASE_PROJECT_ID=\$RAMO_FIREBASE_PROJECT_ID/,
  );
});
