# CI runbook — Ramo Nessa

Este documento define a política de CI antes de qualquer correção de código.

## Regra de ouro

Uma execução vermelha só é tratada como falha de código quando existe um step executado e um log que identifica a falha.

Nunca alterar código de produção apenas porque um workflow terminou como `failure`.

## Classificação

### INFRA/RUNNER/BILLING

Classificar como infraestrutura quando:

- o job foi criado;
- `steps` está `null` ou vazio;
- não existe step nomeado com `conclusion: failure`;
- os logs não existem ou retornam 404/BlobNotFound.

Ação: não alterar código. Verificar runner, GitHub Actions, quota/orçamento e repetir somente quando houver capacidade de execução.

### CODE/DEPENDENCY

Classificar como falha real quando:

- a lista de steps existe;
- pelo menos um step iniciou;
- existe step específico com `conclusion: failure`;
- o log demonstra erro de typecheck, migration, test, analyze, build ou dependência.

Ação: corrigir somente o erro demonstrado pelo log.

### CANCELLED / SKIPPED

`cancelled` por concurrency e `skipped` não são falhas de código.

## Política definitiva de disparo

- branches `feature/**`: sem CI em evento `push`;
- alterações da feature são validadas pelo evento do Pull Request;
- `main`: Preflight executa em `push`;
- PR #1 permanece Draft até revisão final;
- não fazer merge na `main` durante esta fase;
- `concurrency` cancela execuções obsoletas do mesmo PR/ref.

## Preflight único

O arquivo `.github/workflows/preflight.yml` é a única implementação automática das verificações.

Ordem:

1. Core: `npm ci` usando `backend/core/package-lock.json`;
2. Core typecheck;
3. migrations PostgreSQL;
4. segunda execução das migrations para provar idempotência;
5. testes do Core;
6. Design System: resolve/analyze/test;
7. Passenger: dependências com lockfile, analyze e test;
8. Driver: dependências com lockfile, analyze e test.

Android/iOS não devem iniciar antes de o Preflight terminar com sucesso.

## Builds

`Mobile Build Audit` é manual durante a fase Draft. Ele chama o mesmo Preflight reutilizável e só depois executa builds Android/iOS.

Isso evita gastar runners macOS ou builds pesados quando typecheck, migration, testes ou analyze já falhariam antes.

## Dependências

- Flutter fixado em 3.47.5;
- Passenger e Driver mantêm `pubspec.lock` versionado;
- CI usa `flutter pub get --enforce-lockfile` nos apps;
- Core mantém `package-lock.json` versionado;
- CI usa `npm ci`, nunca `npm install`;
- Actions usam versões explícitas.

## Estado observado em 2026-09-23

Os runs anteriores de Core, Passenger, Driver e Mobile Build Audit que terminaram com `steps: null`/sem logs são classificados como INFRA/RUNNER/BILLING. Eles não provam regressão de código.
