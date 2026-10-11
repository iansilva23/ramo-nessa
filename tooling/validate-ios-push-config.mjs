import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = new Map(
  process.argv.slice(2).map((item) => {
    const index = item.indexOf('=');
    if (index < 3 || !item.startsWith('--')) return [item, ''];
    return [item.slice(2, index), item.slice(index + 1)];
  }),
);

const appDir = args.get('app-dir')?.trim() ?? '';
const surface = args.get('surface')?.trim() || 'iOS push';

if (!appDir) {
  throw new Error('--app-dir é obrigatório.');
}

const entitlementsPath = resolve(
  appDir,
  'Runner/Release.entitlements',
);
const infoPlistPath = resolve(
  appDir,
  'Runner/Info.plist',
);
const projectPath = resolve(
  appDir,
  'Runner.xcodeproj/project.pbxproj',
);

const [entitlements, infoPlist, project] = await Promise.all([
  readFile(entitlementsPath, 'utf8'),
  readFile(infoPlistPath, 'utf8'),
  readFile(projectPath, 'utf8'),
]);

if (
  !/<key>aps-environment<\/key>\s*<string>production<\/string>/.test(
    entitlements,
  )
) {
  throw new Error(
    surface + ': Release.entitlements precisa usar aps-environment=production.',
  );
}

if (
  !/<key>UIBackgroundModes<\/key>[\s\S]*?<array>[\s\S]*?<string>remote-notification<\/string>[\s\S]*?<\/array>/.test(
    infoPlist,
  )
) {
  throw new Error(
    surface + ': Info.plist precisa declarar remote-notification em UIBackgroundModes.',
  );
}

if (
  !project.includes(
    'CODE_SIGN_ENTITLEMENTS = Runner/Release.entitlements;',
  )
) {
  throw new Error(
    surface + ': configuração Release não referencia Runner/Release.entitlements.',
  );
}

console.log(surface + ': configuração iOS Push de release válida.');
