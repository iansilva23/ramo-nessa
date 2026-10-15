# Ramo Nessa — atualização controlada do VPS de homologação (GeoAgent)

**Ambiente:** OVH VPS de homologação, repositório `/opt/ramo-nessa`.
Não executar este procedimento no servidor de produção.
**Branch:** `feature/geo-cost-optimization-20261012`.
**Controle de alteração:** PR #4 permanece DRAFT; não fazer merge na main.

## O que será atualizado

- Core, PostgreSQL (apenas migrations novas 082–084) e ADM via
  `node deploy/staging/start.mjs`.
- As integrações Google Maps, OTP, Firebase e Mercado Pago existentes
  permanecem definidas pelo `deploy/staging/.env`, que **não deve ser apagado,
  substituído ou gerado novamente**.
- O Compose agora lê três flags independentes:
  `GEO_CATALOG_SEARCH_ENABLED`,
  `GEO_PASSENGER_LEARNING_ENABLED` e
  `GEO_STORAGE_AUTOMATION_ENABLED`.
  Ausentes ou definidas como `false`, ficam todas **desligadas**.
- O ADM `/admin/geoagent` pode ser homologado sem habilitar coleta
  automática, busca local para passageiros ou limpeza.
- Nunca executar `docker compose down -v`,
  `docker volume rm`, `git reset --hard` ou remover o banco.

## Passo 1: pré-checagens, backup e checkout seguro

Execute como usuário administrativo **no terminal SSH do VPS**. Não envie
senhas, tokens, `.env`, chaves Google nem Firebase JSON para o chat.

```bash
set -euo pipefail
cd /opt/ramo-nessa
test -f deploy/staging/.env || { echo "ERRO: arquivo .env não encontrado"; exit 1; }
test -z "$(git status --porcelain)" || {
  echo "ERRO: existem arquivos alterados/não rastreados. Não substitua nada."; exit 1;
}
if grep -Eq '^GEO_(CATALOG_SEARCH|PASSENGER_LEARNING|STORAGE_AUTOMATION)_ENABLED=true' deploy/staging/.env; then
  echo "ERRO: há flags do GeoAgent ativadas. Desligue-as antes do rollout."; exit 1;
fi
df -h .
OLD_COMMIT="$(git rev-parse HEAD)"
BACKUP_DIR="$HOME/ramo-nessa-backups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
node deploy/staging/backup.mjs --output-dir="$BACKUP_DIR"
LATEST_BACKUP="$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d ! -name '*.incomplete' | sort | tail -n 1)"
test -n "$LATEST_BACKUP" || { echo "ERRO: backup ausente"; exit 1; }
node deploy/staging/verify-backup.mjs --backup-dir="$LATEST_BACKUP"
printf '%s\n' "$OLD_COMMIT" > "$BACKUP_DIR/geoagent-pre-deploy-commit.txt"
git fetch origin feature/geo-cost-optimization-20261012
TARGET_COMMIT="$(git rev-parse FETCH_HEAD)"
git merge-base --is-ancestor "$OLD_COMMIT" "$TARGET_COMMIT" || {
  echo "ERRO: o código do VPS não é ancestral da release. Revisão necessária."; exit 1;
}
git switch --detach "$TARGET_COMMIT"
node deploy/staging/validate-env.mjs
```

O `git switch --detach` fixa a revisão utilizada na homologação,
sem alterar, excluir ou forçar uma branch local. Se o código atual não
for ancestral da nova revisão, **o procedimento para sem modificar o checkout**.

## Passo 2: iniciar e validar

Depois do passo 1 sem erros:

```bash
cd /opt/ramo-nessa
node deploy/staging/start.mjs
node deploy/staging/health-check.mjs
git rev-parse --short HEAD
docker ps --format '{{.Names}} {{.Status}}' | grep ramo-nessa-staging
```

`start.mjs` valida segredos privados sem exibi-los, seleciona os overlays
Firebase/Google/OTP que já estavam configurados, recompila imagens e
executa migrations pelo container `migrate`. As migrações são aditivas.
`health-check.mjs` verifica `/health`, `/ready` e `/admin/`.

## Passo 3: verificação funcional no ADM

1. Acessar `https://vps-a70eab23.vps.ovh.ca/admin/` com usuário administrador.
2. Abrir **GeoAgent** na navegação. Confirmar o estado **Busca local desativada**.
3. Confirmar armazenamento inicial e indicadores do Core.
4. Clicar **Simular limpeza**: nenhum registro deve ser apagado.
5. Confirmar preços e configurações existentes sem mudanças.
6. Fazer coleta manual **apenas de teste**, com dados públicos; revisar a
   comparação; não publicar dados sem conferência.
7. Executar testes em Android e iOS antes de ligar busca ou aprendizado.

Para ligar o aprendizado controlado **em homologação**, posteriormente:
adicionar/editar em `deploy/staging/.env` os valores explícitos
(`GEO_PASSENGER_LEARNING_ENABLED=true`, etc.) e executar o
`start.mjs` novamente, sempre com backup e validação.
`GEO_STORAGE_AUTOMATION_ENABLED` deve continuar `false`
até aprovação específica da limpeza programada.

## Rollback de código (não apagar migrations)

Se a nova versão apresentar falha, e o **backup tiver sido verificado**,
o banco não deve ser substituído automaticamente. As novas migrations
adicionam tabelas/colunas e normalmente são ignoradas pelo código antigo.
Para **reverter apenas Core e ADM**, execute:

```bash
set -euo pipefail
cd /opt/ramo-nessa
OLD_COMMIT="$(cat "$HOME/ramo-nessa-backups/geoagent-pre-deploy-commit.txt")"
git switch --detach "$OLD_COMMIT"
node deploy/staging/start.mjs
node deploy/staging/health-check.mjs
```

Restauração de banco é uma operação separada, potencialmente destrutiva,
e não deve ser executada sem verificar quais transações ocorreram após o backup.

## Controles de segurança

- Nunca publicar credenciais ou `docker compose config` completo em chat.
- Backups ficam privados no usuário do VPS, não no GitHub.
- Não há controle de terminal remoto nesta conversa: **só o operador do VPS
  pode executar e confirmar a conclusão do rollout**.
