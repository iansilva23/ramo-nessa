import assert from 'node:assert/strict';
import test from 'node:test';
import { browserLaunchOptions } from './browser_test_runtime.mjs';

test('Chromium keeps local headless launch options', () => {
  assert.deepEqual(browserLaunchOptions('chromium', {}), {
    headless: true, args: ['--disable-background-networking'],
  });
});
test('only Chromium receives its configured executable', () => {
  const environment = { RAMO_CHROMIUM_EXECUTABLE_PATH: '/fixture/chrome' };
  assert.equal(browserLaunchOptions('chromium', environment).executablePath, '/fixture/chrome');
  assert.deepEqual(browserLaunchOptions('webkit', environment), { headless: true });
});
test('unknown engines fail instead of silently testing Chromium', () => {
  assert.throws(() => browserLaunchOptions('safari'), /Unsupported RAMO_BROWSER_ENGINE/);
});
