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

Backup, monitoramento e hardening do host são tratados no Passo 3.

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

Nunca coloque deploy/prod/.env no Git.

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
3. o volume privado de documentos é preparado com dono correto;
4. Core precisa ficar saudável;
5. só então o gateway público inicia.

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

## Estado atual

Este diretório cobre a preparação da infraestrutura. Ainda não significa Go-Live.

Ficam para os próximos passos:

- backup/restore, monitoramento, alertas e hardening operacional;
- chaves e billing de Google Maps;
- provider OTP real;
- Firebase/FCM/APNs;
- homologação externa Mercado Pago;
- homologação de repasse Pix;
- testes físicos, carga/segurança, piloto e lojas.
