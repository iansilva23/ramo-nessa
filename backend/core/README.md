# Ramo Nessa Core

Backend central e autoridade das regras críticas do ecossistema.

## Stack

O Core usa **Node.js + TypeScript** com PostgreSQL como persistência autoritativa. As regras críticas de preço, corrida, matching, autenticação, pagamentos, ledger, carteira, repasses, realtime e administração permanecem sob autoridade do backend; integrações externas são isoladas por adapters/providers.

## Implementado

- catálogo comercial v1;
- preços fixos por corredor/localidade;
- Moto, Entrega, Carro, Comfort/Black e Buggy;
- regras após 22h já aprovadas;
- Comfort/Black + R$ 50 sobre Carro no Preá quando permitido;
- bloqueio comercial de Carro comum nas rotas 4x4 de Jeri;
- compensação de combustível para coleta distante;
- comissão Ramo Nessa de 10% sobre a tarifa-base;
- compensação de coleta distante é integral do motorista e isenta de comissão;
- política de pagamento digital (Pix/cartão/carteira; dinheiro desligado);
- máquina de estados de pagamento;
- máquina de estados da corrida com bloqueio de matching antes do pagamento;
- validação runtime do contrato de cotação;
- endpoint inicial `POST /v1/pricing/quote`;
- endpoint de desenvolvimento `POST /v1/rides` protegido por identidade dev;
- criação de corrida somente com cotação exata;
- snapshot de preço/comissão por corrida;
- migration PostgreSQL inicial;
- adapter PostgreSQL real para corridas;
- runner de migrations;
- pagamentos persistentes com idempotência;
- endpoint GET de corrida do passageiro em desenvolvimento;
- endpoint POST de registro de pagamento em desenvolvimento;
- simulador financeiro explicitamente bloqueado em produção;
- ledger financeiro de dupla entrada;
- pagamento capturado entra em escrow da corrida;
- liquidação idempotente da corrida concluída;
- 10% creditado em receita da plataforma;
- 90% creditado no saldo contábil do motorista;
- solicitação de saque idempotente;
- reserva atômica do saldo para impedir saque duplicado;
- saldo reservado separado em payout_pending;
- Carteira Ramo Nessa baseada no ledger;
- crédito de carteira idempotente após recarga confirmada;
- pagamento de corrida com carteira e proteção contra saldo negativo;
- Carteira Ramo Nessa do passageiro no ledger;
- recarga só creditada após captura confirmada;
- pagamento de corrida pela carteira com débito atômico;
- proteção contra saldo negativo e pagamentos duplicados;
- pagamento confirmado atualiza a corrida para PAID;
- ponto de embarque da preparação é persistido no Core;
- pagamento confirmado dispara automaticamente a primeira oferta de matching;
- falha transitória de despacho não transforma pagamento confirmado em falha;
- matching permanece bloqueado até a corrida estar financeiramente pronta;
- projeção persistente de motoristas online;
- filtro por categoria, capacidade e localização recente;
- exigência de 4x4 nas rotas aplicáveis de Jericoacoara;
- ranking por proximidade aproximada;
- despacho do domínio só inicia com corrida PAID;
- ofertas de corrida persistentes com expiração;
- apenas uma oferta ativa por vez por corrida;
- aceite atômico vincula motorista e muda corrida para DRIVER_ASSIGNED;
- motorista aceitando fica marcado como ocupado;
- recusa e expiração liberam retentativa para o próximo elegível;
- motorista já tentado não é repetido na mesma rodada;
- ausência de candidatos encerra busca em NO_DRIVER_FOUND;
- endpoints dev de saldo/recarga da Carteira;
- fallback em memória somente fora de produção;
- endpoint `GET /v1/payments/policy`;
- endpoint `GET /health`;
- endpoint `GET /ready` com readiness do PostgreSQL;
- logs HTTP estruturados em JSON com request ID;
- shutdown gracioso de realtime, HTTP e pool PostgreSQL;
- build TypeScript de produção para `dist/`;
- container Node 22 multi-stage executado sem root;
- driver-supply como fonte única de disponibilidade do motorista;
- filtro por categoria e capacidade real do veículo;
- filtro 4x4 para corredores de Jeri;
- ranking de candidatos por proximidade;
- localização vencida excluída do matching;
- distância reta usada só para ranking, nunca para preço;
- testes do domínio.

## Rodar localmente

```bash
cd backend/core
npm install
npm run typecheck
npm test
npm start
```

## Pendências para produção

As fundações citadas acima já existem e são cobertas pelos gates de CI. O que ainda bloqueia produção é principalmente configuração externa, operação e homologação:

- catálogo geoespacial autoritativo para localidades específicas ainda não fechadas;
- infraestrutura hospedada do Core/Admin, domínio, HTTPS e operação de deploy;
- backup automatizado, restore testado, coleta centralizada de logs, monitoramento e alertas/APM;
- chaves comerciais/restrições/billing/quotas do Google Maps;
- provider OTP/SMS real e segredos de produção; o adapter webhook HTTPS, retry idempotente e contrato de integração já estão implementados;
- Firebase/FCM/APNs com credenciais finais;
- storage privado persistente para documentos;
- homologação externa de Mercado Pago para Pix/cartão, webhook, estornos e reconciliação;
- homologação do provider de repasse Pix ao Motorista;
- políticas operacionais/jurídicas finais e validação contábil/fiscal;
- testes em aparelhos físicos, carga, segurança, recuperação, piloto e preparação das lojas.

A autoridade de preço deve permanecer no Core. O Flutter nunca deve decidir sozinho preço final, comissão ou elegibilidade de veículo.


## Realtime
- WebSocket `/v1/realtime/driver` para ofertas e corrida ativa;
- WebSocket `/v1/realtime/passenger?rideId=<id>` para tracking da corrida;
- identidade de produção usa sessão Bearer; headers `x-dev-*` ficam restritos ao fallback explícito fora de produção;
- HTTP/polling permanece como fallback de reconexão;
- Push usa a arquitetura FCM do Core/apps e depende das credenciais finais de produção.
