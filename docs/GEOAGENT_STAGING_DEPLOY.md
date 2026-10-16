# Ramo Nessa — atualização controlada do VPS OVH de homologação (GeoAgent)

**Acesso SSH do Mac:** `ssh ubuntu@15.235.24.180`.
**Projeto no VPS:** `/opt/ramo-nessa`.
**Backup histórico:** `/var/backups/ramo-nessa-staging`.
**Branch GitHub:** `feature/geo-cost-optimization-20261012`.
**PR #4:** DRAFT, sem merge na main.

Este VPS exige **sudo** para os comandos Node de staging e para acesso
ao socket Docker e arquivos de segredo. Os comandos Git são executados
**sem sudo**, com usuário `ubuntu`.

A atualização usa o helper **existente** `deploy/staging/start.mjs`, que
preserva os overlays de Google Maps, Firebase e WhatsApp/OTP. Não sobrescrever
`deploy/staging/.env` nem recriar credenciais ou volumes.

## Etapa 1 — levantamento, sem alterações

```bash
cd /opt/ramo-nessa
git branch --show-current
git rev-parse HEAD
git status --short
sudo docker compose --env-file deploy/staging/.env -f deploy/staging/compose.yml ps
df -h /opt/ramo-nessa /var/backups
```

**Parar** se houver mudanças locais inesperadas, falta de espaço, serviços
incompletos ou branch inesperada. Antes do deploy, identificar o commit atual
e confirmar se é ancestral da revisão a instalar.

## Etapa 2 — backup VERIFICADO, depois código

Somente após a pré-checagem sem problemas; executar como `ubuntu`.
Os comandos abortam em qualquer falha.

```bash
set -euo pipefail
cd /opt/ramo-nessa
test -f deploy/staging/.env
test -z "$(git status --porcelain)" || {
  echo "PARADO: há alterações no Git; não sobrescrever."; exit 1;
}
if grep -Eq '^GEO_(CATALOG_SEARCH|PASSENGER_LEARNING|STORAGE_AUTOMATION)_ENABLED=true' deploy/staging/.env; then
  echo "PARADO: funções GeoAgent já habilitadas; revisar antes de atualizar."; exit 1;
fi

# Guardar a revisão antes de mexer no código.
OLD_COMMIT="$(git rev-parse HEAD)"
sudo install -d -m 0700 /var/backups/ramo-nessa-staging
printf '%s\n' "$OLD_COMMIT" | sudo tee /var/backups/ramo-nessa-staging/geoagent-pre-deploy-commit.txt >/dev/null
sudo chmod 0600 /var/backups/ramo-nessa-staging/geoagent-pre-deploy-commit.txt
sudo node deploy/staging/validate-env.mjs

# O procedimento histórico usa /var/backups e precisa de sudo.
sudo node deploy/staging/backup.mjs --output-dir=/var/backups/ramo-nessa-staging
SNAPSHOT="$(sudo find /var/backups/ramo-nessa-staging   -mindepth 1 -maxdepth 1 -type d ! -name '*.incomplete'   | sort | tail -n 1)"
test -n "$SNAPSHOT"
sudo node deploy/staging/verify-backup.mjs --backup-dir="$SNAPSHOT"

# Nunca avançar para uma revisão diferente da auditada.
git fetch origin feature/geo-cost-optimization-20261012
TARGET="7f6086763d78f64c65d4939151d728e46f51b6fb"
# A branch pode ter novos commits de documentação. Instalar somente
# o commit auditado, exigindo que ainda pertença ao histórico remoto.
git merge-base --is-ancestor "$TARGET" FETCH_HEAD || {
  echo "PARADO: revisão auditada não encontrada no histórico remoto."; exit 1;
}
git merge-base --is-ancestor "$OLD_COMMIT" "$TARGET" || {
  echo "PARADO: histórico divergente; não forçar nem sobrescrever."; exit 1;
}

# Manter a branch de trabalho original intocada.
git switch -c deploy/geoagent-staging-20261012
git merge --ff-only "$TARGET"

sudo node deploy/staging/validate-env.mjs
sudo node deploy/staging/start.mjs
sudo node deploy/staging/health-check.mjs
sudo docker compose --env-file deploy/staging/.env   -f deploy/staging/compose.yml ps
git log -1 --format='%h %s'
```

Se a branch local `deploy/geoagent-staging-20261012` já existir,
**parar e inspecionar** em vez de sobrescrever.

`start.mjs` seleciona automaticamente os overlays Google/Firebase/OTP e
usa `docker compose up -d --build`, sem remover volumes. As migrations
082, 083 e 084 são aditivas, mas sempre dependem de backup verificado.

## Etapa 3 — homologação

1. Verificar `https://vps-a70eab23.vps.ovh.ca/ready`.
2. Acessar `https://vps-a70eab23.vps.ovh.ca/admin/`, abrir GeoAgent.
3. Confirmar que **busca local, aprendizado e limpeza programada estão
   desligados** (padrão `false`).
4. Conferir métricas de armazenamento, **Simular limpeza** e acesso por perfil.
5. Confirmar telas, regiões de preço, pagamentos e integrações existentes.
6. Testar com Android e iOS antes de habilitar busca GeoDB para passageiros.

Não ativar Google Places, importação automática ou limpeza real para
homologação sem avaliação de cobranças, licenças e impacto de UX.

## Recuperação de código, sem restauração automática do banco

**Somente em caso de falha**, voltar ao commit registrado antes da atualização
(`OLD_COMMIT` acima), depois de confirmar seu valor pelo terminal.
Para um procedimento repetível, antes do deploy salve esse valor em uma pasta
administrativa privada (não em Git nem no chat). Em qualquer rollback, manter
a migration aplicada sem tentar apagar tabelas ou substituir volumes.
Nunca usar `docker compose down -v`, `git reset --hard`,
`docker volume rm` ou `pg_restore` sem uma operação separada e verificada.

**Observação:** não há SSH remoto conectado a esta conversa. A atualização
do VPS só pode ser considerada concluída depois que o operador executar
o procedimento e enviar as saídas não sensíveis das verificações.
