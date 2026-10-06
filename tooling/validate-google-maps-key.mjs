const args = new Map(
  process.argv
    .slice(2)
    .map((item) => {
      const index = item.indexOf('=');
      if (index < 3 || !item.startsWith('--')) return [item, ''];
      return [item.slice(2, index), item.slice(index + 1)];
    }),
);

const envName = args.get('env')?.trim() ?? '';
const surface = args.get('surface')?.trim() || envName || 'Google Maps';

if (!/^[A-Z0-9_]+$/.test(envName)) {
  throw new Error('--env deve informar o nome de uma variável de ambiente.');
}

const raw = process.env[envName] ?? '';
const value = raw.trim();

if (
  value.length < 20 ||
  value.length > 256 ||
  value !== raw ||
  /\s/.test(value) ||
  /[\u0000-\u001F\u007F]/.test(value) ||
  value === 'CHANGE_ME' ||
  value.startsWith('REPLACE_WITH_') ||
  /example|placeholder|dummy/i.test(value)
) {
  throw new Error(
    surface +
      ': chave Google Maps ausente, placeholder ou com formato inválido.',
  );
}

console.log(surface + ': chave presente e com formato básico válido.');
