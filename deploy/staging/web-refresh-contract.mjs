import { sameConfiguration } from './web-image-contract.mjs';
export function fixWebPolicyHeader(text) {
  const marker = '  header {\n    -Server\n';
  if (!text.includes('handle_path /passageiro/* {') || !text.includes('handle_path /motorista/* {') || !text.includes(marker)) throw Error('Caddy diferente do esperado.');
  // Deleting any field defers the ENTIRE header block. Keep deletion separate,
  // otherwise its global geolocation=() overwrites the nested PWA permission.
  return text.replace(marker, '  header -Server\n  header {\n');
}
export function assertGatewayOnly(baseline, preview, bundles) {
  if (!sameConfiguration(Object.keys(baseline.services).sort(), Object.keys(preview.services).sort())) throw Error('Lista de serviços mudou.');
  for (const [name, service] of Object.entries(baseline.services)) {
    if (name !== 'gateway' && !sameConfiguration(service, preview.services[name])) throw Error('Serviço fora do gateway mudaria.');
  }
  const previous = structuredClone(baseline.services.gateway);
  const next = structuredClone(preview.services.gateway);
  const mounts = next.volumes.filter(item => item.target === '/srv/web');
  if (mounts.length !== 1 || mounts[0].type !== 'bind' || mounts[0].source !== bundles || mounts[0].read_only !== true) throw Error('Mount Web inválido.');
  for (const item of [previous, next]) {
    delete item.image;
    item.volumes = item.volumes.filter(volume => volume.target !== '/srv/web');
  }
  if (!sameConfiguration(previous, next)) throw Error('Gateway mudaria fora de imagem/mount Web.');
}

// Match the last confirmed rollout rather than the original pre-refresh state.
export function assertPreviousRefresh(target, plan, completed, bundles, caddy) {
  const expectedBundles = '/opt/ramo-nessa-web/releases/' + target.slice(0, 12) + '/bundles';
  if (plan.target !== target || completed.target !== target ||
      completed.publicBundleHashesMatched !== true || completed.coreUnchanged !== true ||
      completed.databaseUnchangedByUpdater !== true || plan.newBundles !== expectedBundles ||
      bundles !== expectedBundles || caddy !== plan.caddyNext) {
    throw Error('Estado diferente da última atualização Web confirmada.');
  }
}
