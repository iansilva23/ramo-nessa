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

## Estado verificado em 19/10/2026 — PR #35

- PR #35 já incorpora os arquivos de Core, catálogo, diretório municipal, matriz do ADM, `app.js`, CSS e testes de preços dos PRs anteriores sobre a base financeira.
- O arquivo de workflow financeiro adicionado à branch #33 foi preservado por cópia sem alteração de conteúdo.
- Integração automatizada: workflow `39299754230`, commit `6c5209e8ea58948fef7f51ca23b5f1e5ef99cf72`, cinco jobs com conclusão `success`: Core, ADM, Passageiro, Motorista e Design System.
- Atenção: esta evidência é de testes unitários/estáticos, **não** é aceite visual, geoespacial, integração do banco ou corrida real.
- O teste de matriz utiliza distâncias sintéticas de 7,25 km para todas as combinações; não valida distância roteada Google Maps nem comprova tarifas comercialmente autorizadas em cada rota.
- Na linha-base estática, `distanceFarePolicies.length === 0`. Tarifas regionais por km permanecem dependentes de regras comerciais específicas explicitamente aprovadas/publicadas.
- Os 26 registros municipais pendentes continuam sujeitos a verificação individual; não atribuir município por suposição.

### Gates faltantes antes de qualquer deploy

1. Teste funcional no navegador do ADM: tabela, filtros, categorias desativadas, atalhos, edição dia/noite, rascunho, reload, conflitos de versões, perfis de acesso e publicação somente em ambiente descartável autorizado.
2. Teste do fluxo real GPS/Maps: correspondência de localidade, município e geocercas, trajetos ida/volta, transfer externo, rota indisponível e distância inválida.
3. Conferência ponta a ponta do preço mostrado, assinado, cobrado e contabilizado, sem executar pagamentos ou repasses reais.
4. Revisão visual em navegador e dispositivos Android/iOS; os cinco jobs do workflow não substituem esse aceite.
5. Reconferir HEAD do financeiro e estado da VPS antes da futura integração; garantir backup testado e rollback. Não modificar checkout compartilhado nem reiniciar serviços durante o preparo.

**Estado final: revisão automatizada aprovada; homologação funcional e publicação pendentes. PR permanece DRAFT, sem merge ou deploy.**

## Atualização do gate de homologação — 20/10/2026 (PR #35)

- HEAD verificado: `607faa7317d277c49a123dd770d12a51184da65d`.
- CI verificado: [workflow 39431377658](https://github.com/iansilva23/ramo-nessa/actions/runs/39431377658), **7/7 jobs aprovados**: Core, ADM, Chromium isolado, PostgreSQL 16 descartável, Flutter Passageiro, Flutter Motorista e Design System.
- A central `Rascunhos e publicações` está integrada ao ADM e o Chromium testa revisão de diferenças, confirmação/cancelamento, conflito de edição, publicação apenas no mock isolado e atualização do histórico.
- A interface foi testada automaticamente em dimensões móveis com captura de evidência e verificação de overflow. Isso não equivale a teste manual em aparelhos reais.
- A publicação e o descarte usam a API de versões existente com verificação de permissões, revisão explícita e trava otimista. Nenhuma operação de escrita real foi realizada nesta auditoria.

### Fechamento objetivo, sem acrescentar melhorias cosméticas

**Concluído sob evidência automatizada:** integração das três áreas do ADM, comparação, rascunhos, histórico, controles de publicação, regressões Core/ADM/Flutter e fluxo fictício no navegador.

**Não concluído / não autoriza deploy:** aceite visual manual, cotação GPS real e dispatch municipal, 26 municípios/localidades sem comprovação, valores comerciais e parâmetros por km sem aprovação, integração preço exibido/assinado/cobrado/contabilizado, auditoria de backup e rollback na implantação futura.

**Decisão de engenharia:** suspender mudanças cosméticas menores na central já aprovada e tratar as pendências acima como gates separados. Não bloquear a conclusão técnica da reorganização da interface por aprovações comerciais externas, mas nunca chamá-la de sistema integralmente pronto para produção.
