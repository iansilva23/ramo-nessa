# Produção — Ramo Nessa

Este diretório prepara a infraestrutura de produção sem publicar nada por conta própria.
O desenho inicial é para um VPS Linux único, com PostgreSQL, Core e Admin/gateway no mesmo host.

> Não execute o deploy agora. O Core recusa iniciar em produção enquanto Google Maps, OTP e Mercado Pago reais não estiverem configurados. Essa trava é intencional.

## Arquitetura

- gateway: Caddy público em 80/443, TLS automático e Admin em /admin/;
- core: privado na rede Docker, sem porta publicada;
- migrate: executa migrations da mesma imagem antes do Core;
- postgres: PostgreSQL 16 com volume persistente e sem porta pública;
- driver_documents: volume persistente privado para CNH/CRLV;
- caddy_data e caddy_config: persistem certificados e estado do Caddy.

Admin e API ficam na mesma origem. O proxy sobrescreve X-Forwarded-For e o Core usa TRUST_PROXY=true apenas atrás desse gateway.

## 1. Pré-requisitos do host

Antes do deploy real:

1. VPS Linux com Docker Engine e Docker Compose v2;
2. domínio real apontando para o IP público do VPS;
3. portas TCP 80 e 443 liberadas; UDP 443 é opcional para HTTP/3;
4. horário/NTP do host correto;
5. acesso SSH administrativo protegido.

Backup, monitoramento e hardening básico já possuem procedimentos neste diretório. A implantação real no VPS continua pendente.

## 2. Gerar o arquivo privado de ambiente

Na raiz do repositório:

    node deploy/prod/generate-env.mjs

O script cria deploy/prod/.env com permissão 0600 e segredos internos aleatórios. Ele não imprime os segredos.

Depois edite somente os campos CHANGE_ME:

- APP_DOMAIN;
- ACME_EMAIL;
- OTP_WEBHOOK_URL e OTP_WEBHOOK_TOKEN;
- GOOGLE_MAPS_SERVER_API_KEY;
- MERCADO_PAGO_ACCESS_TOKEN;
- MERCADO_PAGO_WEBHOOK_SECRET.

Também coloque a Service Account Firebase de produção em
`deploy/prod/secrets/firebase-service-account.json` (ou ajuste
`FIREBASE_SERVICE_ACCOUNT_HOST_FILE`) e restrinja o arquivo para `0600`.
O projeto Firebase e o fluxo APNs estão documentados em
`docs/FIREBASE_PUSH_PRODUCTION.md`.

Nunca coloque deploy/prod/.env nem a Service Account no Git.

### Mercado Pago Payouts para repasses Pix

O provedor nativo de repasses fica desligado até a homologação externa terminar.
Quando o Mercado Pago liberar o produto Payouts para a aplicação/conta:

1. siga `docs/MERCADO_PAGO_PAYOUTS.md`;
2. valide primeiro com `MERCADO_PAGO_PAYOUT_MODE=test` fora do stack produtivo;
3. gere o par Ed25519 e envie somente a chave pública ao Mercado Pago;
4. mantenha a chave privada fora do Git e configure sua versão base64 somente no
   arquivo privado `deploy/prod/.env`;
5. depois da homologação, configure:

       DRIVER_PAYOUT_PROVIDER_NAME=mercado-pago-payouts
       MERCADO_PAGO_PAYOUT_MODE=production
       MERCADO_PAGO_PAYOUT_ACCESS_TOKEN=<token Payouts produtivo>
       MERCADO_PAGO_PAYOUT_PRIVATE_KEY_BASE64=<chave privada PEM em base64>

O validador de produção recusa modo diferente de `production`, token ausente,
chave inválida ou chave que não seja Ed25519. Se o nome do provedor ficar vazio,
Payouts permanece desativado.

## 3. Validar antes de qualquer deploy

    node deploy/prod/validate-env.mjs
    docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml config > /dev/null

A validação rejeita domínio de exemplo, placeholders, URL OTP sem HTTPS, segredos curtos, banco apontando para host diferente do PostgreSQL interno e configuração parcial de repasse.

## 4. Quando os próximos passos estiverem homologados

Somente depois de Google Maps, OTP e Mercado Pago estarem configurados e validados, o stack poderá ser iniciado:

    docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml up -d --build

A ordem é protegida pelo Compose:

1. PostgreSQL precisa ficar saudável;
2. migrations precisam terminar com sucesso;
3. o volume privado de documentos é preparado com dono e permissões corretos;
4. o storage check precisa confirmar escrita/leitura como usuário não-root;
5. Core precisa ficar saudável;
6. só então o gateway público inicia.

Nunca use docker compose down -v em produção.

## 5. Verificações após o deploy real

Quando chegar a hora:

    https://<APP_DOMAIN>/health
    https://<APP_DOMAIN>/ready
    https://<APP_DOMAIN>/admin/

/ready deve retornar 200 apenas quando o Core e PostgreSQL estiverem prontos.

## 6. Primeiro usuário Admin

Com o stack já saudável:

    docker compose --env-file deploy/prod/.env -f deploy/prod/compose.yml run --rm core node dist/scripts/create-admin-user.js --name="Seu nome" --email="seu@email.com"

A senha inicial e o segredo TOTP devem ser guardados fora do Git e nunca copiados para logs, commits ou chats públicos.

O comando também imprime o `userId` do usuário criado. Copie somente esse UUID
para `ADMIN_OWNER_USER_ID` e `ADMIN_PAYOUT_APPROVER_USER_ID` no arquivo privado
`deploy/prod/.env`. A primeira variável identifica a conta proprietária para a
gestão de funcionários; a segunda mantém aprovações, modo manual e comandos de
repasse Pix exclusivos do proprietário. Reinicie o Core para aplicar. Enquanto
a variável financeira estiver vazia ou inválida, os comandos de repasse
protegidos permanecem bloqueados com fail-closed; API keys e outros
administradores com `finance:write` não podem substituir o proprietário.

## 7. Backup verificado

Com o stack real em execução, grave os backups fora do repositório:

    node deploy/prod/backup.mjs --output-dir=/var/backups/ramo-nessa

O script cria um pg_dump em formato custom, um arquivo dos documentos privados e um manifesto com SHA-256. Ele valida os dois artefatos antes de marcar o diretório como concluído e nunca inclui deploy/prod/.env.

Para verificar novamente um snapshot sem restaurar nada:

    node deploy/prod/verify-backup.mjs --backup-dir=/var/backups/ramo-nessa/<snapshot>

Para provar a restaurabilidade sem tocar no stack de produção:

    node deploy/prod/restore-drill.mjs --backup-dir=/var/backups/ramo-nessa/<snapshot>

O restore drill revalida o manifesto/hashes, cria um PostgreSQL efêmero sem rede,
restaura o dump com `--exit-on-error`, extrai os documentos em um volume Docker
descartável e remove os recursos isolados ao final. Ele não usa os volumes
`postgres_data` ou `driver_documents` do Compose de produção.

A existência desse comando não substitui o exercício operacional. Antes do
Go-Live, ele ainda deve ser executado com um snapshot real do VPS, registrando o
resultado.

### Retenção local segura

A retenção local é separada da criação do backup e começa sempre em modo de
simulação:

    node deploy/prod/backup-retention.mjs --backup-dir=/var/backups/ramo-nessa --keep=14 --apply=false

Revise a lista `removable` impressa pelo comando. Somente depois dessa revisão,
para aplicar a política:

    node deploy/prod/backup-retention.mjs --backup-dir=/var/backups/ramo-nessa --keep=14 --apply=true

O script aceita no mínimo 7 snapshots, remove apenas diretórios completos com
manifesto reconhecido do Ramo Nessa e preserva `.incomplete`, links e pastas
estranhas. A retenção local não substitui uma cópia off-site. Não automatize a
exclusão local sem antes definir e testar a estratégia externa de backup.

## 8. Monitor de saúde

Depois do domínio real estar ativo:

    node deploy/prod/health-check.mjs

O comando valida HTTPS em /health, /ready e /admin/. Ele imprime JSON por endpoint e retorna código diferente de zero quando algo falha, podendo ser chamado por cron/systemd ou por monitor externo.

## 9. Baseline de segurança

As regras mínimas do host estão em deploy/prod/SECURITY_BASELINE.md. O Compose também limita logs Docker e aplica no-new-privileges/cap_drop no Core e migrations.

## Estado atual

Este diretório cobre a preparação da infraestrutura, backup verificado, monitoramento básico e hardening de containers. Ainda não significa Go-Live.

Ficam para os próximos passos:

- implantação real e teste de recuperação em VPS isolado;
- monitoramento/alertas externos e retenção off-site de backup;
- chaves e billing de Google Maps;
- provider OTP real;
- credenciais reais e homologação Firebase/FCM/APNs;
- homologação externa Mercado Pago;
- homologação de repasse Pix;
- testes físicos, carga/segurança, piloto e lojas.

OTP também aceita `OTP_PROVIDER=entrar-whatsapp`, com `ENTRAR_API_SECRET` privado
no ambiente do Core; nesse modo `OTP_WEBHOOK_URL` e `OTP_WEBHOOK_TOKEN` não são
necessários. O padrão continua webhook. Ver `docs/OTP_PRODUCTION.md` para limites,
contrato externo e homologação em aparelho físico antes de liberar a operação.
