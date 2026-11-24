# Site institucional Ramo Nessa na VPS

Next.js standalone em Node 24, com os assets e layout do site Refinado. Formulário e gerenciamento persistem no SQLite do volume existente.

Consulte `../../docs/SITE_ADMIN.md` para permissões, publicação, backups e atualização da instalação atual.

Desenvolvimento: `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, `pnpm build`. Para os testes HTTP, copie public/ e .next/static/ para .next/standalone e rode `node test/production-http.mjs` e `node test/site-production-http.mjs`. Os testes não usam o banco da VPS.

Central do Motorista em `/motoristas`, com aulas gerenciadas pelo ADM e acesso pela conta individual do motorista. Consulte `../../docs/DRIVER_TRAINING.md` para operação, validação e atualização da VPS.
