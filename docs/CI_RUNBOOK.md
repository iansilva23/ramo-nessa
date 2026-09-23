# CI runbook — Ramo Nessa

Este documento define como interpretar GitHub Actions antes de qualquer alteração de código.

## Regra de ouro

Uma execução vermelha só é tratada como falha de código quando existe um step executado e um log que identifica a falha.

Nunca alterar código de produção apenas porque um workflow terminou como failure.

## Classificação

### 1. INFRA/RUNNER/BILLING

Classificar como infraestrutura quando todos os sinais abaixo ocorrerem:

- o job foi criado;
- `steps` está `null` ou a lista de steps está vazia;
- não existe step nomeado com `conclusion: failure`;
- os logs do job não existem ou o endpoint de logs retorna 404/BlobNotFound.

Ação:

1. não alterar código;
2. verificar status público do GitHub Actions;
3. verificar quota, orçamento e método de pagamento do GitHub Actions;
4. repetir o job somente depois que o runner puder iniciar.

### 2. CODE/DEPENDENCY

Classificar como falha real quando:

- a lista de steps existe;
- pelo menos um step iniciou;
- existe um step específico com `conclusion: failure`;
- existe log do step/job mostrando erro de analyze, test, build, migration ou dependência.

Ação:

1. corrigir somente o erro demonstrado pelo log;
2. executar novamente o workflow relevante;
3. não usar falhas de outros workflows sem steps como evidência adicional.

### 3. CANCELLED

Se `conclusion: cancelled` e existe um run mais novo do mesmo grupo de concurrency, tratar como substituição de execução, não como erro.

### 4. SKIPPED

`skipped` não é falha.

## Política de disparo

Durante desenvolvimento em `feature/**`:

- Core CI roda somente quando arquivos de `backend/core/**` ou o próprio workflow mudam;
- Passenger CI roda somente quando Passenger/design system ou o próprio workflow mudam;
- Driver CI roda somente quando Driver/design system ou o próprio workflow mudam;
- o Mobile Build Audit completo não roda automaticamente em feature branches;
- Android release + iOS simulator completos são executados manualmente com `workflow_dispatch`.

No PR:

- enquanto o PR estiver Draft, sincronizações não disparam a bateria inteira novamente;
- ao marcar o PR como ready for review, os CIs relevantes executam uma validação completa;
- o Mobile Build Audit também executa nessa transição.

Na `main`:

- os workflows relevantes continuam habilitados para push;
- este projeto não deve fazer merge na `main` antes da revisão final.

## Estado conhecido em 2026-09-23

No HEAD `4d30721224d003efb58165b73ea14871914fba99`, Core CI, Passenger CI, Driver CI e Mobile Build Audit criaram jobs sem steps e sem logs. Esse estado é classificado como INFRA/RUNNER/BILLING e não prova regressão no código.

## Observação sobre consumo

O repositório é privado. Evitar a combinação `push feature + pull_request synchronize` para a mesma alteração e evitar macOS em cada commit, porque isso duplica ou multiplica consumo de GitHub Actions sem aumentar a cobertura útil.
