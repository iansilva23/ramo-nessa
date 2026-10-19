# Integração segura — Pricing V5 com Core/ADM financeiro

Status: PLANEJAMENTO E AUDITORIA — NÃO HOMOLOGADO. Não publicar, mesclar ou ativar tarifas.

## Referências imutáveis verificadas em 19/10/2026
- Base financeira PR #33: `1b72444f091d525ea985488c78fbc767ebb168eb`.
- Candidata de preços PR #34: `aaaf0889d440f6d2c30016af1437874e5ffaa633`.
- Ancestral operacional de preços PR #29: `2ee07808d819bc73eb7377c5d273124ecd19acb0`.
- PRs #30 → #31 → #32 → #34 preservam a sequência de preços e geografia.
- Branches de #33 e #34 divergem da PR #29: 25 commits próprios financeiros e 29 commits próprios de preços.

## Invariantes inegociáveis
1. Não tocar na `main`, nas branches financeiras ou em PRs existentes.
2. Não modificar migrations, providers, payout, ledger, endpoints de pagamento, secrets, variáveis de ambiente, Compose ou infraestrutura.
3. Não mudar valores comerciais, política de elegibilidade aprovada nem catálogo publicado no PostgreSQL.
4. Preservar mecanismo de bloqueio de envios reais existente; nenhuma ativação financeira.
5. Não usar `/opt/ramo-nessa` (checkout com alterações locais) como base para construir ou publicar.
6. Sem deploy, sem alteração de containers/volumes, sem merge. PR deve permanecer DRAFT.

## Integração de código pendente
- Partir do snapshot financeiro imutável acima e portar seletivamente somente as alterações dos PRs #30/#31/#32/#34.
- Revisar manualmente os arquivos compartilhados `apps/admin/src/app.js` e `apps/admin/styles.css`; não copiar integralmente uma versão sobre a outra.
- Preservar importação `payout-policy.js` e telas de Financeiro do snapshot financeiro.
- Validar dependências de `apps/admin/src/localities-admin.js`, `pricing-rate-matrix.js`, `pages/pricing.html`, `pages/localities.html` e alterações do Core em `backend/core/src/pricing/*`.
- Confirmar alterações no conteúdo dos bundles efetivamente servidos antes de qualquer rollout.
- Revisar compatibilidade das versões e migrações no ambiente de teste sem modificar banco ativo.

## Gates de aceitação
1. Revisão dos patches por caminho/arquivo e teste de merge sem perder código financeiro.
2. Typecheck/lint/testes Core e ADM; Flutter Passageiro e Motorista (analyze/tests/builds).
3. Matriz de todos os pares autorizados: cinco categorias, ida/volta, dia/noite, mínimos/máximos, passageiro extra, transfer e bloqueios municipais.
4. Testar distância inválida/sem Google Maps, ausência de cotação, comissão, líquido do motorista e versão de tarifa; cobertura com km regionais permanece inativa até aprovação comercial.
5. ADM: criar e editar rascunho, permissões, concorrência, histórico, salvar/recarregar e publicação somente em sandbox autorizado.
6. Regressão dos fluxos financeiros sem processar repasses reais; integração não altera processamento de pagamentos.
7. Teste visual real de ADM, Android, iOS, Web e geocercas; smoke tests em homologação isolada.
8. Backup verificável e rollback completo antes de solicitar autorização de publicação.

## Ambientes observados (relato do operador)
- Core ativo reportado: imagem `sha256:f5c6e83d9ba952f78d2faf519cdf49fa90b6b654a0d0b7b0850deb073b4b1e24`, versão de receptor financeiro.
- Gateway ativo reportado: `sha256:59d92511d7f6bf5c39aa18975a1d74ae0526f60097a52a4524c1ed481051dae1`.
- Bundles Web: `/opt/ramo-nessa-web/releases/driver-asaas-21ae1f310144/bundles`.
- Estas versões podem mudar: inspecionar novamente quando houver futura autorização de rollout.
- Nenhuma evidência de que #30–#34 estejam instalados na VPS; não inferir somente por nomes de imagens.

## Estado deste PR
Este commit apenas registra a base e os gates para a integração. NÃO transporta o código de preços e NÃO comprova testes. Próximo trabalho: efetuar cherry-picks seletivos com resolução de sobreposições, realizar testes e anexar evidências.