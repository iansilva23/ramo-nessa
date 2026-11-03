// Test-only browser selection. Product bundles and native apps do not import this.
export const browserName = process.env.RAMO_BROWSER_ENGINE ?? 'chromium';

export function browserLaunchOptions(name, environment = process.env) {
  if (!['chromium', 'webkit'].includes(name)) throw new Error('Unsupported RAMO_BROWSER_ENGINE');
  if (name === 'webkit') return { headless: true };
  return { headless: true, args: ['--disable-background-networking'],
    ...(environment.RAMO_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: environment.RAMO_CHROMIUM_EXECUTABLE_PATH } : {}) };
}

export async function launchTestBrowser() {
  const options = browserLaunchOptions(browserName);
  const moduleUrl = process.env.RAMO_BROWSER_TEST_MODULE
    ?? new URL('./browser-tests/node_modules/playwright/index.mjs', import.meta.url).href;
  const engines = await import(moduleUrl);
  return engines[browserName].launch(options);
}
