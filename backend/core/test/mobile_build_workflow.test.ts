import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function workflow(name: string): Promise<string> {
  return readFile(
    new URL(`../../../.github/workflows/${name}`, import.meta.url),
    'utf8',
  );
}

async function repoFile(path: string): Promise<string> {
  return readFile(
    new URL(`../../../${path}`, import.meta.url),
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

  for (const secretName of [
    'RAMO_FIREBASE_ANDROID_PASSENGER_APP_ID',
    'RAMO_FIREBASE_ANDROID_DRIVER_APP_ID',
    'RAMO_FIREBASE_IOS_PASSENGER_APP_ID',
    'RAMO_FIREBASE_IOS_DRIVER_APP_ID',
  ]) {
    assert.equal(yaml.includes('secrets.' + secretName), true);
  }

  assert.equal(
    yaml.includes('secrets.RAMO_FIREBASE_PASSENGER_APP_ID ||'),
    false,
  );
  assert.equal(
    yaml.includes('secrets.RAMO_FIREBASE_DRIVER_APP_ID ||'),
    false,
  );
  assert.equal(
    yaml.includes('secrets.RAMO_FIREBASE_APP_ID }}'),
    false,
  );
  assert.equal(
    (yaml.match(/tooling\/validate-firebase-mobile-config\.mjs/g) ?? [])
      .length,
    4,
  );
});

test('audit final Android exige assinatura de produção e verifica APK', async () => {
  const yaml = await workflow('mobile-build-audit.yml');

  assert.match(yaml, /Prepare Passenger Android production signing/);
  assert.match(yaml, /Prepare Driver Android production signing/);
  assert.match(yaml, /Verify Passenger production APK signature/);
  assert.match(yaml, /Verify Driver production APK signature/);

  assert.equal(
    (yaml.match(/RAMO_PRODUCTION_SIGNING: "true"/g) ?? []).length,
    2,
  );
  assert.equal(
    (yaml.match(/"\$APKSIGNER" verify --verbose --print-certs/g) ?? []).length,
    2,
  );

  for (const secretName of [
    'RAMO_ANDROID_KEYSTORE_BASE64',
    'RAMO_ANDROID_KEYSTORE_PASSWORD',
    'RAMO_ANDROID_KEY_ALIAS',
    'RAMO_ANDROID_KEY_PASSWORD',
  ]) {
    assert.equal(yaml.includes('secrets.' + secretName), true);
  }

  const [passengerGradle, driverGradle] = await Promise.all([
    repoFile('apps/passenger/android/app/build.gradle.kts'),
    repoFile('apps/driver/android/app/build.gradle.kts'),
  ]);

  for (const gradle of [passengerGradle, driverGradle]) {
    assert.match(gradle, /RAMO_PRODUCTION_SIGNING/);
    assert.match(gradle, /RAMO_ANDROID_KEYSTORE_PATH/);
    assert.match(gradle, /create\("production"\)/);
    assert.match(
      gradle,
      /signingConfig = signingConfigs\.getByName\("production"\)/,
    );
    assert.equal(
      gradle.includes('signingConfig = signingConfigs.getByName("debug")'),
      false,
    );
    assert.match(gradle, /applicationIdSuffix = "\.preview"/);
  }
});

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
